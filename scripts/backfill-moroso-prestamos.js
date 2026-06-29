/**
 * Migración única: rellena el campo `moroso` en préstamos que no lo tienen
 * y lo sincroniza con el estado del cliente.
 *
 * Uso: node scripts/backfill-moroso-prestamos.js
 * Requiere serviceAccountKey.json en la raíz del proyecto.
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const EMPRESAS_COLLECTION = "empresas";
const CLIENTES_SUBCOLLECTION = "clientes";
const PRESTAMOS_SUBCOLLECTION = "prestamos";
const BATCH_LIMIT = 400;

async function backfillMorosoEmpresa(empresaId) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);

  // 1 — Propagar moroso:true de clientes a préstamos
  const morososSnap = await empresaRef
    .collection(CLIENTES_SUBCOLLECTION)
    .where("moroso", "==", true)
    .get();

  for (const clienteDoc of morososSnap.docs) {
    const prestamosSnap = await empresaRef
      .collection(PRESTAMOS_SUBCOLLECTION)
      .where("clienteId", "==", clienteDoc.id)
      .get();

    for (let i = 0; i < prestamosSnap.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      prestamosSnap.docs.slice(i, i + BATCH_LIMIT).forEach((d) =>
        batch.update(d.ref, { moroso: true })
      );
      await batch.commit();
    }
  }

  // 2 — Rellenar moroso:false en préstamos sin el campo
  let lastDoc = null;
  let total = 0;
  while (true) {
    let q = empresaRef
      .collection(PRESTAMOS_SUBCOLLECTION)
      .orderBy("__name__")
      .limit(500);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1];

    const sinCampo = snap.docs.filter((d) => d.data().moroso === undefined);
    for (let i = 0; i < sinCampo.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      sinCampo.slice(i, i + BATCH_LIMIT).forEach((d) =>
        batch.update(d.ref, { moroso: false })
      );
      await batch.commit();
    }
    total += sinCampo.length;
    if (snap.docs.length < 500) break;
  }
  console.log(`  [${empresaId}] ${total} préstamos sin campo rellenados`);
}

async function main() {
  const empresasSnap = await db.collection(EMPRESAS_COLLECTION).get();
  console.log(`Procesando ${empresasSnap.size} empresas...`);
  for (const emp of empresasSnap.docs) {
    await backfillMorosoEmpresa(emp.id);
  }
  console.log("Backfill completado.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
