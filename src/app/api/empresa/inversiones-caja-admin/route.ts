import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import {
  EMPRESAS_COLLECTION,
  INVERSIONES_RUTA_CAJA_ADMIN_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

export type InversionRutaCajaAdminItem = {
  id: string;
  rutaId: string;
  rutaNombre: string;
  monto: number;
  fecha: string | null;
  invertidoPorUid: string;
  invertidoPorNombre: string;
};

/** GET: historial de inversiones caja ruta → caja admin (solo el propio admin). */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const col = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(apiUser.uid)
    .collection(INVERSIONES_RUTA_CAJA_ADMIN_SUBCOLLECTION);

  const cursorRaw = request.nextUrl.searchParams.get("cursor");
  const base = col.orderBy("fecha", "desc");
  const snap = await (cursorRaw
    ? base.startAfter(Timestamp.fromDate(new Date(cursorRaw))).limit(10)
    : base.limit(10)
  ).get();

  const items: InversionRutaCajaAdminItem[] = snap.docs.map((d) => {
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

  return NextResponse.json({ items, hasMore: items.length === 10 });
}
