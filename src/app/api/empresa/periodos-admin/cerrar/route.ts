import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PERIODOS_ADMIN_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { buildPeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

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

  const abiertosSnap = await col
    .where("adminId", "==", apiUser.uid)
    .where("estado", "==", "abierto")
    .limit(1)
    .get();

  if (abiertosSnap.empty) {
    return NextResponse.json({ error: "No hay un periodo abierto para cerrar." }, { status: 400 });
  }
  const doc = abiertosSnap.docs[0];
  const cierre = await buildPeriodoAdminSnapshot(db, apiUser.empresaId, apiUser.uid);

  const rutasCol = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION);
  const nowRuta = new Date();

  const batch = db.batch();
  batch.update(doc.ref, {
    estado: "cerrado",
    fechaCierre: FieldValue.serverTimestamp(),
    cerradoPorUid: apiUser.uid,
    cierre,
  });
  for (const r of cierre.rutas) {
    batch.update(rutasCol.doc(r.rutaId), {
      ganancias: 0,
      gastos: 0,
      perdidas: 0,
      ultimaActualizacion: nowRuta,
    });
  }
  await batch.commit();

  for (const r of cierre.rutas) {
    const snap = await rutasCol.doc(r.rutaId).get();
    if (snap.exists) {
      await upsertCapitalRutaSnapshot(db, apiUser.empresaId, r.rutaId, snap.data()!);
    }
  }

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
