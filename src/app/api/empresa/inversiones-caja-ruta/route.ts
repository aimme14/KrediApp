import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  INVERSIONES_CAJA_RUTA_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

export type InversionCajaRutaItem = {
  id: string;
  rutaId: string;
  rutaNombre: string;
  monto: number;
  fecha: string | null;
  invertidoPorUid: string;
  invertidoPorNombre: string;
};

/** GET: historial de inversiones caja admin → caja ruta (solo el propio admin). */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const col = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(apiUser.uid)
    .collection(INVERSIONES_CAJA_RUTA_SUBCOLLECTION);

  const snap = await col.orderBy("fecha", "desc").limit(80).get();

  const items: InversionCajaRutaItem[] = snap.docs.map((d) => {
    const data = d.data();
    const fechaRaw = data.fecha;
    let fechaIso: string | null = null;
    if (fechaRaw && typeof (fechaRaw as { toDate?: () => Date }).toDate === "function") {
      fechaIso = (fechaRaw as { toDate: () => Date }).toDate().toISOString();
    }
    return {
      id: d.id,
      rutaId: typeof data.rutaId === "string" ? data.rutaId : "",
      rutaNombre: typeof data.rutaNombre === "string" ? data.rutaNombre : "",
      monto: typeof data.monto === "number" ? data.monto : 0,
      fecha: fechaIso,
      invertidoPorUid: typeof data.invertidoPorUid === "string" ? data.invertidoPorUid : "",
      invertidoPorNombre:
        typeof data.invertidoPorNombre === "string" ? data.invertidoPorNombre : "",
    };
  });

  items.sort((a, b) => {
    const ta = a.fecha ? new Date(a.fecha).getTime() : 0;
    const tb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({ items });
}
