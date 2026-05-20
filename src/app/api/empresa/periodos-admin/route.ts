import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, PERIODOS_ADMIN_SUBCOLLECTION } from "@/lib/empresas-db";

function tsToIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    return d.toISOString();
  }
  return null;
}

/** GET: lista periodos del admin autenticado (más recientes primero). */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administrador" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const col = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PERIODOS_ADMIN_SUBCOLLECTION);

  const snap = await col.where("adminId", "==", apiUser.uid).get();
  const list = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        estado: (data.estado as string) === "cerrado" ? "cerrado" : "abierto",
        fechaApertura: tsToIso(data.fechaApertura),
        fechaCierre: tsToIso(data.fechaCierre),
        abiertoPorUid: (data.abiertoPorUid as string) ?? "",
        cerradoPorUid: (data.cerradoPorUid as string) ?? null,
      };
    })
    .sort((a, b) => {
      const ta = a.fechaApertura ?? "";
      const tb = b.fechaApertura ?? "";
      return tb.localeCompare(ta);
    })
    .slice(0, 48);

  return NextResponse.json({ periodos: list });
}
