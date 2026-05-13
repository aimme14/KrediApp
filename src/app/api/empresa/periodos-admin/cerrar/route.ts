import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, PERIODOS_ADMIN_SUBCOLLECTION } from "@/lib/empresas-db";
import { buildPeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";

/** POST: cierra el periodo abierto del admin (snapshot actual). */
export async function POST(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
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

  const todos = await col.get();
  const doc = todos.docs.find((d) => {
    const x = d.data();
    return x.adminId === apiUser.uid && x.estado === "abierto";
  });

  if (!doc) {
    return NextResponse.json({ error: "No hay un periodo abierto para cerrar." }, { status: 400 });
  }
  const cierre = await buildPeriodoAdminSnapshot(db, apiUser.empresaId, apiUser.uid);

  await doc.ref.update({
    estado: "cerrado",
    fechaCierre: FieldValue.serverTimestamp(),
    cerradoPorUid: apiUser.uid,
    cierre,
  });

  const updated = await doc.ref.get();
  const data = updated.data()!;

  return NextResponse.json({
    ok: true,
    id: doc.id,
    estado: "cerrado",
    fechaApertura: data.fechaApertura?.toDate?.()?.toISOString?.() ?? null,
    fechaCierre: data.fechaCierre?.toDate?.()?.toISOString?.() ?? null,
    apertura: data.apertura,
    cierre,
  });
}
