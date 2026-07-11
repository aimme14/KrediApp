import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  buildEmpresaAccesoInfo,
  procesarEmpresaSiExpirada,
} from "@/lib/empresa-acceso";
import { assertSuperAdmin } from "@/lib/super-admin-auth";
import { EMPRESAS_COLLECTION } from "@/lib/empresas-db";

/**
 * Carga fechas de acceso. Si una empresa ya llegó al día de corte y sigue activa,
 * la deshabilita en cascada (útil en local y como refuerzo del cron).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { superAdminUid, empresaIds } = body as {
      superAdminUid: string;
      empresaIds: string[];
    };

    if (!superAdminUid || !Array.isArray(empresaIds)) {
      return NextResponse.json(
        { error: "Faltan superAdminUid o empresaIds" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const auth = await assertSuperAdmin(db, superAdminUid);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const uniqueIds = Array.from(
      new Set(empresaIds.filter((id) => typeof id === "string" && id.trim()))
    );
    const accesos: Record<string, ReturnType<typeof buildEmpresaAccesoInfo>> = {};
    const empresasDeshabilitadas: string[] = [];

    for (const empresaId of uniqueIds) {
      const snap = await db.collection(EMPRESAS_COLLECTION).doc(empresaId).get();
      let data = snap.exists ? snap.data() : undefined;
      let info = buildEmpresaAccesoInfo(empresaId, data);

      if (info.vencido && info.activa) {
        const ok = await procesarEmpresaSiExpirada(db, empresaId);
        if (ok) {
          empresasDeshabilitadas.push(empresaId);
          const refreshed = await db.collection(EMPRESAS_COLLECTION).doc(empresaId).get();
          data = refreshed.exists ? refreshed.data() : data;
          info = buildEmpresaAccesoInfo(empresaId, data);
        }
      }

      accesos[empresaId] = info;
    }

    return NextResponse.json({ accesos, empresasDeshabilitadas });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al cargar accesos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
