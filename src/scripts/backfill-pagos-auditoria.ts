/**
 * Backfill de campos de auditoría en pagos históricos (adminId, estado, denormalización).
 *
 * Uso:
 *   npx tsx src/scripts/backfill-pagos-auditoria.ts [--dry-run] [empresaId]
 *
 * Si omitís empresaId, procesa todas las empresas.
 */

import path from "path";
import dotenv from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")]) {
  dotenv.config({ path: p });
}

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";

type PrestamoMeta = {
  adminId: string;
  rutaId: string;
  clienteId: string;
  clienteNombre: string;
};

function acreditaCajaRutaDesdePago(d: Record<string, unknown>): boolean {
  const rol = typeof d.cobradoPorRol === "string" ? d.cobradoPorRol : "";
  const metodo = typeof d.metodoPago === "string" ? d.metodoPago : "";
  return rol === "admin" || metodo === "transferencia";
}

async function backfillEmpresa(
  db: Firestore,
  empresaId: string,
  dryRun: boolean
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;

  const clienteNombres = new Map<string, string>();
  const rutaNombres = new Map<string, string>();

  const clientesSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .get();
  for (const doc of clientesSnap.docs) {
    const n = doc.data().nombre;
    if (typeof n === "string" && n.trim()) clienteNombres.set(doc.id, n.trim());
  }

  const rutasSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .get();
  for (const doc of rutasSnap.docs) {
    const n = doc.data().nombre;
    if (typeof n === "string" && n.trim()) rutaNombres.set(doc.id, n.trim());
  }

  const prestamosSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .get();

  const prestamoMeta = new Map<string, PrestamoMeta>();
  for (const pdoc of prestamosSnap.docs) {
    const d = pdoc.data();
    const adminId = typeof d.adminId === "string" ? d.adminId.trim() : "";
    const rutaId = typeof d.rutaId === "string" ? d.rutaId.trim() : "";
    const clienteId = typeof d.clienteId === "string" ? d.clienteId.trim() : "";
    const cn =
      typeof d.clienteNombre === "string" && d.clienteNombre.trim()
        ? d.clienteNombre.trim()
        : clienteNombres.get(clienteId) ?? "";
    prestamoMeta.set(pdoc.id, { adminId, rutaId, clienteId, clienteNombre: cn });
  }

  const BATCH = 400;
  let batch = db.batch();
  let batchCount = 0;

  const flush = async () => {
    if (batchCount === 0) return;
    if (!dryRun) await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const pdoc of prestamosSnap.docs) {
    const meta = prestamoMeta.get(pdoc.id);
    if (!meta?.adminId) {
      skipped++;
      continue;
    }

    const pagosSnap = await pdoc.ref.collection(PAGOS_SUBCOLLECTION).get();
    for (const pg of pagosSnap.docs) {
      const d = pg.data() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      if (!d.adminId) patch.adminId = meta.adminId;
      if (!d.empresaId) patch.empresaId = empresaId;
      if (!d.prestamoId) patch.prestamoId = pdoc.id;
      if (!d.rutaId && meta.rutaId) patch.rutaId = meta.rutaId;
      if (!d.clienteId && meta.clienteId) patch.clienteId = meta.clienteId;
      if (!d.clienteNombre && meta.clienteNombre) patch.clienteNombre = meta.clienteNombre;
      if (!d.rutaNombre && meta.rutaId) {
        const rn = rutaNombres.get(meta.rutaId);
        if (rn) patch.rutaNombre = rn;
      }
      if (!d.estado) patch.estado = "activo";
      if (!d.cobradoPorRol && typeof d.empleadoId === "string") {
        patch.cobradoPorRol =
          d.empleadoId === meta.adminId ? "admin" : "empleado";
      }
      if (d.tipo === "pago" && d.acreditaCajaRuta === undefined) {
        patch.acreditaCajaRuta = acreditaCajaRutaDesdePago(d);
      }
      if (
        d.tipo === "pago" &&
        d.tieneSnapshotsCompletos === undefined &&
        typeof d.cuotaCapital === "number" &&
        typeof d.cuotaGanancia === "number"
      ) {
        patch.tieneSnapshotsCompletos = false;
      }

      if (Object.keys(patch).length === 0) {
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] ${pdoc.id}/pagos/${pg.id}`, patch);
      } else {
        batch.update(pg.ref, patch);
        batchCount++;
        if (batchCount >= BATCH) {
          await flush();
        }
      }
      updated++;
    }
  }

  await flush();
  return { updated, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const empresaIdArg = args.find((a) => a !== "--dry-run")?.trim();

  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const db = getAdminFirestore();

  const empresaIds: string[] = [];
  if (empresaIdArg) {
    empresaIds.push(empresaIdArg);
  } else {
    const snap = await db.collection(EMPRESAS_COLLECTION).get();
    empresaIds.push(...snap.docs.map((d) => d.id));
  }

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const empresaId of empresaIds) {
    console.log(`\n=== Empresa ${empresaId} ${dryRun ? "(dry-run)" : ""} ===`);
    const { updated, skipped } = await backfillEmpresa(db, empresaId, dryRun);
    console.log(`Actualizados: ${updated}, sin cambios: ${skipped}`);
    totalUpdated += updated;
    totalSkipped += skipped;
  }

  console.log(`\nTotal actualizados: ${totalUpdated}, sin cambios: ${totalSkipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
