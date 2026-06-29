/**
 * Backfill: calcula cobradoAcumulado por ruta sumando pagos históricos.
 * Ejecutar UNA VEZ antes de activar el cambio en resumen/route.ts.
 *
 * Uso: node scripts/backfill-cobrado-acumulado-rutas.js
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("../serviceAccountKey.json"); // ajusta la ruta si es necesario

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const empresasSnap = await db.collection("empresas").get();
  console.log(`Procesando ${empresasSnap.size} empresa(s)...`);

  for (const empresaDoc of empresasSnap.docs) {
    const empresaId = empresaDoc.id;
    console.log(`\n── Empresa: ${empresaId}`);

    // Lee todos los pagos de tipo "pago" no anulados de esta empresa
    const pagosSnap = await db
      .collectionGroup("pagos")
      .where("empresaId", "==", empresaId)
      .where("tipo", "==", "pago")
      .get();

    const porRuta = new Map();
    for (const pagoDoc of pagosSnap.docs) {
      const data = pagoDoc.data();
      // Excluir anulados (campo puede estar ausente en docs viejos → tratar como activo)
      if (data.estado === "anulado") continue;
      const rutaId = typeof data.rutaId === "string" ? data.rutaId.trim() : "";
      if (!rutaId) continue;
      const monto = typeof data.monto === "number" ? data.monto : 0;
      porRuta.set(rutaId, (porRuta.get(rutaId) ?? 0) + monto);
    }

    console.log(`  Rutas con pagos: ${porRuta.size}`);

    // Escribe en lotes de 400
    let batch = db.batch();
    let count = 0;

    for (const [rutaId, cobrado] of porRuta.entries()) {
      const rutaRef = db
        .collection("empresas")
        .doc(empresaId)
        .collection("rutas")
        .doc(rutaId);
      batch.update(rutaRef, { cobradoAcumulado: Math.round(cobrado * 100) / 100 });
      count++;

      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`  ${count} rutas escritas...`);
      }
    }

    if (count % 400 !== 0) await batch.commit();
    console.log(`  ✓ ${count} rutas actualizadas en empresa ${empresaId}`);
  }

  console.log("\nBackfill completado.");
}

main().catch((e) => {
  console.error("Error en backfill:", e);
  process.exit(1);
});
