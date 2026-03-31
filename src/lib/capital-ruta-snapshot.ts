/**
 * Snapshots de capital por ruta bajo empresas/{empresaId}/capital/root/rutas/{rutaId}
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_BRANCH_DOC_ID,
  CAPITAL_RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalRutaFromRutaFields } from "@/lib/capital-formulas";

export interface CapitalRutaSnapshotPayload {
  rutaId: string;
  nombre: string;
  adminId: string;
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
  capitalRuta: number;
  updatedAt: Date;
}

function branchRef(db: Firestore, empresaId: string) {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_BRANCH_DOC_ID);
}

/** Garantiza el documento padre para la subcolección rutas/. */
export async function ensureCapitalBranchDoc(
  db: Firestore,
  empresaId: string
): Promise<void> {
  await branchRef(db, empresaId).set(
    { kind: "capitalBranch", updatedAt: new Date() },
    { merge: true }
  );
}

export function buildSnapshotFromRutaData(
  rutaId: string,
  data: Record<string, unknown>
): CapitalRutaSnapshotPayload {
  const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
  const cajasEmpleados =
    typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
  const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
  const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
  const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;
  const capitalTotal =
    typeof data.capitalTotal === "number" ? data.capitalTotal : undefined;
  const capitalRuta = computeCapitalRutaFromRutaFields({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    ganancias,
    perdidas,
    capitalTotal,
  });
  return {
    rutaId,
    nombre: typeof data.nombre === "string" ? data.nombre : "",
    adminId: typeof data.adminId === "string" ? data.adminId : "",
    cajaRuta,
    cajasEmpleados,
    inversiones,
    ganancias,
    perdidas,
    capitalRuta,
    updatedAt: new Date(),
  };
}

export async function upsertCapitalRutaSnapshot(
  db: Firestore,
  empresaId: string,
  rutaId: string,
  data: Record<string, unknown>
): Promise<void> {
  await ensureCapitalBranchDoc(db, empresaId);
  const payload = buildSnapshotFromRutaData(rutaId, data);
  await branchRef(db, empresaId)
    .collection(CAPITAL_RUTAS_SUBCOLLECTION)
    .doc(rutaId)
    .set(payload, { merge: true });
}

/** Sincroniza todos los snapshots de ruta desde empresas/{id}/rutas. */
export async function syncAllCapitalRutaSnapshots(
  db: Firestore,
  empresaId: string
): Promise<void> {
  const rutasSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .get();
  if (rutasSnap.empty) return;
  await ensureCapitalBranchDoc(db, empresaId);
  const batch = db.batch();
  for (const d of rutasSnap.docs) {
    const payload = buildSnapshotFromRutaData(d.id, d.data() as Record<string, unknown>);
    const ref = branchRef(db, empresaId)
      .collection(CAPITAL_RUTAS_SUBCOLLECTION)
      .doc(d.id);
    batch.set(ref, payload, { merge: true });
  }
  await batch.commit();
}
