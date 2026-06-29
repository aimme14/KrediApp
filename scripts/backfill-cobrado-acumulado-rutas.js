/**
 * Backfill: calcula cobradoAcumulado por ruta sumando pagos históricos.
 * Ejecutar UNA VEZ antes de activar el cambio en resumen/route.ts.
 *
 * Uso: node scripts/backfill-cobrado-acumulado-rutas.js
 *
 * No usa collectionGroup — itera empresas → prestamos → pagos directamente.
 * No requiere índices especiales.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("../serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const empresasSnap = await db.collection("empresas").get();
  console.log(`Procesando ${empresasSnap.size} empresa(s)...`);

  for (const empresaDoc of empresasSnap.docs) {
    const empresaId = empresaDoc.id;
    console.log(`\n── Empresa: ${empresaId}`);

    // Leer todos los prestamos de la empresa
    const prestamosSnap = await db
      .collection("empresas")
      .doc(empresaId)
      .collection("prestamos")
      .get();

    console.log(`  Préstamos: ${prestamosSnap.size}`);

    // Acumular cobrado por rutaId
    const porRuta = new Map();

    for (const prestamoDoc of prestamosSnap.docs) {
      const rutaId = (prestamoDoc.data().rutaId ?? "").trim();
      if (!rutaId) continue;

      // Leer pagos de este préstamo
      const pagosSnap = await db
        .collection("empresas")
        .doc(empresaId)
        .collection("prestamos")
        .doc(prestamoDoc.id)
        .collection("pagos")
        .get();

      for (const pagoDoc of pagosSnap.docs) {
        const d = pagoDoc.data();
        if (d.tipo !== "pago") continue;
        if (d.estado === "anulado") continue;
        const monto = typeof d.monto === "number" ? d.monto : 0;
        if (monto <= 0) continue;
        porRuta.set(rutaId, (porRuta.get(rutaId) ?? 0) + monto);
      }
    }

    console.log(`  Rutas con cobros: ${porRuta.size}`);

    // Escribir en lotes de 400
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

    if (count % 400 !== 0 && count > 0) await batch.commit();
    console.log(`  ✓ ${count} rutas actualizadas en empresa ${empresaId}`);
  }

  console.log("\nBackfill completado.");
}

main().catch((e) => {
  console.error("Error en backfill:", e);
  process.exit(1);
});
