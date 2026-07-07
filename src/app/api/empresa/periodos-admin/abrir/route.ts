import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, PERIODOS_ADMIN_SUBCOLLECTION } from "@/lib/empresas-db";
import { buildPeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

/** POST: abre un periodo (snapshot actual). No si ya hay uno abierto. */
export async function POST(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
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
  const tieneAbierto = !abiertosSnap.empty;

  if (tieneAbierto) {
    return NextResponse.json(
      { error: "Ya tienes un periodo abierto. Ciérralo antes de abrir otro." },
      { status: 400 }
    );
  }

  const apertura = await buildPeriodoAdminSnapshot(db, apiUser.empresaId, apiUser.uid);
  const docRef = col.doc();

  await docRef.set({
    adminId: apiUser.uid,
    estado: "abierto",
    fechaApertura: FieldValue.serverTimestamp(),
    fechaCierre: null,
    abiertoPorUid: apiUser.uid,
    cerradoPorUid: null,
    apertura,
    cierre: null,
  });

  const created = await docRef.get();
  const data = created.data()!;

  return NextResponse.json({
    ok: true,
    id: docRef.id,
    estado: "abierto",
    fechaApertura: data.fechaApertura?.toDate?.()?.toISOString?.() ?? null,
    apertura,
  });
}
