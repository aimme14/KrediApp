/**
 * TEMPORAL — corrige Base (cajaRuta) tras anulación con reporte ya aprobado.
 * Descuenta el monto del cobro anulado de cajaRuta y recalcula capitalTotal.
 *
 * Uso:
 *   npx tsx src/scripts/corregir-base-ruta-anulacion-TEMP.ts --dry-run \
 *     --empresa=A55dJ6qlFeRwYBOZYWT2IrDQU432 --prestamo=UuUr4WbfNY4X3QvaQ7Q0 --pago=sjC35M1S7vPgqAkxKBfs
 *
 *   CONFIRM=1 npx tsx src/scripts/corregir-base-ruta-anulacion-TEMP.ts \
 *     --empresa=... --prestamo=... --pago=...
 */

import path from "path";
import dotenv from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")]) {
  dotenv.config({ path: p });
}

import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { round2 } from "@/lib/ruta-financiera-admin";

function arg(name: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : "";
}

const dryRun = process.argv.includes("--dry-run");
const confirm = process.env.CONFIRM === "1";
const empresaId = arg("empresa");
const prestamoId = arg("prestamo");
const pagoId = arg("pago");

async function main() {
  if (!empresaId || !prestamoId || !pagoId) {
    console.error("Faltan --empresa, --prestamo o --pago");
    process.exit(1);
  }

  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const db = getAdminFirestore();

  const pagoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId)
    .collection(PAGOS_SUBCOLLECTION)
    .doc(pagoId);

  const pagoSnap = await pagoRef.get();
  if (!pagoSnap.exists) throw new Error("Pago no encontrado");

  const pd = pagoSnap.data()!;
  if (pd.estado !== "anulado") {
    throw new Error(`El pago no está anulado (estado: ${pd.estado ?? "activo"})`);
  }

  const monto = typeof pd.monto === "number" ? pd.monto : 0;
  if (monto <= 0) throw new Error("Monto del pago inválido");

  const rutaId =
    (typeof pd.rutaId === "string" ? pd.rutaId.trim() : "") ||
    (await (async () => {
      const pr = await db
        .collection(EMPRESAS_COLLECTION)
        .doc(empresaId)
        .collection(PRESTAMOS_SUBCOLLECTION)
        .doc(prestamoId)
        .get();
      return typeof pr.data()?.rutaId === "string" ? pr.data()!.rutaId.trim() : "";
    })());

  if (!rutaId) throw new Error("No se encontró rutaId");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const rutaSnap = await rutaRef.get();
  if (!rutaSnap.exists) throw new Error("Ruta no encontrada");

  const rd = rutaSnap.data()!;
  const cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
  const cajasEmpleados = typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
  const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
  const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;
  const capitalTotalAntes =
    typeof rd.capitalTotal === "number"
      ? rd.capitalTotal
      : computeCapitalTotalRutaDesdeSaldos({ cajaRuta, cajasEmpleados, inversiones, perdidas });

  const nuevaCajaRuta = round2(cajaRuta - monto);
  if (nuevaCajaRuta < 0) {
    throw new Error(`cajaRuta quedaría negativa (${nuevaCajaRuta}). Revisar manualmente.`);
  }

  const nuevoCapitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta: nuevaCajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });

  console.log("=== Corrección Base tras anulación ===");
  console.log({
    ruta: rd.nombre ?? rutaId,
    rutaId,
    pagoId,
    cliente: pd.clienteNombre,
    montoAnulado: monto,
    motivoAnulacion: pd.motivoAnulacion,
  });
  console.log("\n=== Antes → Después ===");
  console.log({
    cajaRuta: `${cajaRuta} → ${nuevaCajaRuta}`,
    cajasEmpleados: `${cajasEmpleados} (sin cambio)`,
    inversiones: `${inversiones} (sin cambio)`,
    capitalTotal: `${capitalTotalAntes} → ${nuevoCapitalTotal}`,
  });

  const diffEsperada = round2(monto);
  const diffReal = round2(capitalTotalAntes - nuevoCapitalTotal);
  if (Math.abs(diffReal - diffEsperada) > 0.02) {
    throw new Error(`Diff capital inesperada: ${diffReal} (esperada ${diffEsperada})`);
  }

  if (dryRun || !confirm) {
    console.log("\n✓ Dry-run OK. Para aplicar:");
    console.log(
      `  $env:CONFIRM="1"; npx tsx src/scripts/corregir-base-ruta-anulacion-TEMP.ts ` +
        `--empresa=${empresaId} --prestamo=${prestamoId} --pago=${pagoId}`
    );
    return;
  }

  const now = new Date();
  await rutaRef.update({
    cajaRuta: nuevaCajaRuta,
    capitalTotal: nuevoCapitalTotal,
    ultimaActualizacion: now,
    correccionBaseAnulacionTemp: {
      pagoId,
      monto,
      cajaRutaAntes: cajaRuta,
      aplicadoEn: now,
    },
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }

  console.log("\n✓ Corrección aplicada.");
  console.log({
    cajaRuta: after.data()?.cajaRuta,
    capitalTotal: after.data()?.capitalTotal,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
