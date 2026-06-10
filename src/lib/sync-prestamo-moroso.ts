import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

const BATCH_LIMIT = 500;

/** Propaga el flag moroso del cliente a todos sus préstamos. */
export async function syncMorosoEnPrestamosCliente(
  db: Firestore,
  empresaId: string,
  clienteId: string,
  moroso: boolean
): Promise<void> {
  const prestamosSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .where("clienteId", "==", clienteId)
    .get();

  if (prestamosSnap.empty) return;

  for (let i = 0; i < prestamosSnap.docs.length; i += BATCH_LIMIT) {
    const chunk = prestamosSnap.docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((doc) => batch.update(doc.ref, { moroso }));
    await batch.commit();
  }
}

/** Rellena moroso en préstamos que aún no tienen el campo (migración). */
export async function backfillMorosoPrestamosSinCampo(
  db: Firestore,
  empresaId: string,
  prestamoDocs: QueryDocumentSnapshot[]
): Promise<void> {
  const sinCampo = prestamoDocs.filter((d) => d.data().moroso === undefined);
  if (sinCampo.length === 0) return;

  const clienteIds = Array.from(
    new Set(sinCampo.map((d) => d.data().clienteId as string).filter(Boolean))
  );
  const morosoPorCliente = new Map<string, boolean>();

  await Promise.all(
    clienteIds.map(async (clienteId) => {
      const snap = await db
        .collection(EMPRESAS_COLLECTION)
        .doc(empresaId)
        .collection(CLIENTES_SUBCOLLECTION)
        .doc(clienteId)
        .get();
      morosoPorCliente.set(clienteId, snap.data()?.moroso === true);
    })
  );

  for (let i = 0; i < sinCampo.length; i += BATCH_LIMIT) {
    const chunk = sinCampo.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((doc) => {
      const clienteId = doc.data().clienteId as string;
      batch.update(doc.ref, { moroso: morosoPorCliente.get(clienteId) === true });
    });
    await batch.commit();
  }
}

/** Sincroniza moroso en todos los préstamos de clientes morosos y rellena los que faltan. */
export async function backfillMorosoEmpresa(
  db: Firestore,
  empresaId: string,
  adminId?: string
): Promise<void> {
  const clientesCol = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CLIENTES_SUBCOLLECTION);

  const morososSnap = adminId
    ? await clientesCol.where("adminId", "==", adminId).where("moroso", "==", true).get()
    : await clientesCol.where("moroso", "==", true).get();

  await Promise.all(
    morososSnap.docs.map((d) =>
      syncMorosoEnPrestamosCliente(db, empresaId, d.id, true)
    )
  );

  const prestamosCol = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION);

  const prestamosSnap = adminId
    ? await prestamosCol.where("adminId", "==", adminId).limit(500).get()
    : await prestamosCol.limit(500).get();

  await backfillMorosoPrestamosSinCampo(db, empresaId, prestamosSnap.docs);
}
