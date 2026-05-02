/**
 * Snapshot del cierre diario (misma lógica que cobros del día del empleado).
 * Incluye desembolsos desde caja del empleado (`desembolsoDesde: caja_empleado`).
 * Parámetros explícitos para reutilizar en preview admin y PDF tras aprobación.
 */

import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION,
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
  GASTOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  fechaDiaCalendarioDesdeISO,
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
  parseFechaDiaColombia,
} from "@/lib/colombia-day-bounds";
import { etiquetaMotivoGastoTipo } from "@/lib/gasto-motivo";
import { tuCajaDelDiaFormula } from "@/lib/tu-caja-del-dia";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cuotas enteras restantes asumiendo cuotas iguales (totalAPagar / numeroCuotas). */
function cuotasFaltantesEstimadas(
  saldoTrasPago: number,
  totalAPagar: number,
  numeroCuotas: number
): number {
  if (saldoTrasPago <= 0) return 0;
  if (numeroCuotas <= 0 || totalAPagar <= 0) return 0;
  const valorCuota = round2(totalAPagar / numeroCuotas);
  if (valorCuota <= 0) return 0;
  return Math.max(0, Math.ceil(saldoTrasPago / valorCuota - 1e-9));
}

export type CobroDiaSnapshotItem = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  metodoPago: string | null;
  fecha: string | null;
  /** Total a pagar del préstamo (`totalAPagar`). */
  totalAPagar: number;
  saldoPendienteTrasPago: number;
  saldoPendientePrestamoActual: number;
  /** Estimado con cuotas iguales según `totalAPagar` y `numeroCuotas`. */
  cuotasFaltantes: number;
  numeroCuotas: number;
};

export type NoPagoDiaSnapshotItem = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  fecha: string | null;
  motivoNoPago: string;
  nota: string | null;
  saldoPendientePrestamoActual: number;
  /** Total pactado del préstamo (`totalAPagar`). */
  totalAPagar: number;
  numeroCuotas: number;
  /** Cuotas restantes estimadas (misma lógica que en cobros). */
  cuotasPendientes: number;
};

export type GastoDiaSnapshotItem = {
  id: string;
  monto: number;
  descripcion: string;
  fecha: string | null;
  /** Según campo `tipo` del gasto (transporte / alimentacion / otro). */
  motivo: string;
};

/** Desembolso desde caja del empleado (no incluye préstamos cargados a caja de ruta por admin). */
export type PrestamoDesembolsoDiaSnapshotItem = {
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  fecha: string | null;
  totalAPagar: number;
};

export type CierreDiaSnapshot = {
  fechaDia: string;
  rutaId: string;
  cobros: CobroDiaSnapshotItem[];
  noPagos: NoPagoDiaSnapshotItem[];
  totalCobrosLista: number;
  /** Total cobrado en ruta + base − gastos − desembolsos desde tu caja. */
  tuCajaDelDia: number;
  totalCobrosAcreditanTuCaja: number;
  totalGastosDia: number;
  gastosDelDia: GastoDiaSnapshotItem[];
  totalBaseAsignadaDia: number;
  prestamosDesembolsoDelDia: PrestamoDesembolsoDiaSnapshotItem[];
  totalPrestamosDesembolsoDia: number;
};

export type BuildCierreDiaSnapshotParams = {
  empresaId: string;
  empleadoUid: string;
  rutaId: string;
  /** YYYY-MM-DD (Colombia). Debe ser válido. */
  fechaDia: string;
};

export async function buildCierreDiaSnapshot(
  db: Firestore,
  params: BuildCierreDiaSnapshotParams
): Promise<CierreDiaSnapshot> {
  const { empresaId, empleadoUid, rutaId, fechaDia } = params;
  if (!parseFechaDiaColombia(fechaDia).ok) {
    throw new Error("fechaDia inválida");
  }

  const start = inicioDiaColombiaUtc(fechaDia);
  const end = finDiaColombiaUtc(fechaDia);
  if (!start || !end) {
    throw new Error("No se pudo calcular el día en Colombia");
  }

  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  const prestamosCol = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION);

  const prestamosSnap = await prestamosCol.where("rutaId", "==", rutaId).get();

  const prestamoMeta = new Map<
    string,
    {
      clienteId: string;
      saldoPendienteActual: number;
      empleadoTitularId: string;
      totalAPagar: number;
      numeroCuotas: number;
    }
  >();
  const clienteIds = new Set<string>();

  for (const d of prestamosSnap.docs) {
    const x = d.data() as Record<string, unknown>;
    const clienteId = typeof x.clienteId === "string" ? x.clienteId.trim() : "";
    const empleadoTitularId =
      typeof x.empleadoId === "string" ? x.empleadoId.trim() : "";
    const saldo =
      typeof x.saldoPendiente === "number" && Number.isFinite(x.saldoPendiente)
        ? x.saldoPendiente
        : 0;
    const totalAPagar =
      typeof x.totalAPagar === "number" && Number.isFinite(x.totalAPagar) ? x.totalAPagar : 0;
    const numeroCuotasRaw = x.numeroCuotas;
    const numeroCuotas =
      typeof numeroCuotasRaw === "number" && Number.isFinite(numeroCuotasRaw) && numeroCuotasRaw > 0
        ? Math.floor(numeroCuotasRaw)
        : 0;
    prestamoMeta.set(d.id, {
      clienteId,
      saldoPendienteActual: round2(saldo),
      empleadoTitularId,
      totalAPagar: round2(totalAPagar),
      numeroCuotas,
    });
    if (clienteId) clienteIds.add(clienteId);
  }

  const clienteNombre = new Map<string, string>();
  await Promise.all(
    Array.from(clienteIds).map(async (cid) => {
      const cref = db
        .collection(EMPRESAS_COLLECTION)
        .doc(empresaId)
        .collection(CLIENTES_SUBCOLLECTION)
        .doc(cid);
      const cs = await cref.get();
      const n =
        cs.exists && typeof (cs.data() as Record<string, unknown>)?.nombre === "string"
          ? String((cs.data() as Record<string, unknown>).nombre).trim()
          : "";
      clienteNombre.set(cid, n || "—");
    })
  );

  type PagoRow = {
    pagoId: string;
    prestamoId: string;
    fechaMs: number;
    monto: number;
    metodoPago: string | null;
    empleadoIdRegistro: string;
  };

  type NoPagoRow = {
    pagoId: string;
    prestamoId: string;
    fechaMs: number;
    motivoNoPago: string;
    nota: string | null;
  };

  const pagosRaw: PagoRow[] = [];
  const noPagosRaw: NoPagoRow[] = [];

  const CHUNK = 12;
  const prestamoDocs = prestamosSnap.docs;
  for (let i = 0; i < prestamoDocs.length; i += CHUNK) {
    const chunk = prestamoDocs.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (pdoc) => {
        const pq = await pdoc.ref
          .collection(PAGOS_SUBCOLLECTION)
          .where("fecha", ">=", startTs)
          .where("fecha", "<=", endTs)
          .get();
        for (const p of pq.docs) {
          const pd = p.data() as Record<string, unknown>;
          const tipo = typeof pd.tipo === "string" ? pd.tipo : "";
          const f = pd.fecha as { toMillis?: () => number } | undefined;
          const fechaMs = typeof f?.toMillis === "function" ? f.toMillis() : 0;

          if (tipo === "no_pago") {
            const empId = typeof pd.empleadoId === "string" ? pd.empleadoId.trim() : "";
            if (empId !== empleadoUid) continue;
            const motivo =
              typeof pd.motivoNoPago === "string" && pd.motivoNoPago.trim()
                ? pd.motivoNoPago.trim()
                : "—";
            const notaRaw = pd.nota;
            const nota =
              typeof notaRaw === "string" && notaRaw.trim()
                ? notaRaw.trim()
                : null;
            noPagosRaw.push({
              pagoId: p.id,
              prestamoId: pdoc.id,
              fechaMs,
              motivoNoPago: motivo,
              nota,
            });
            continue;
          }

          if (tipo !== "pago") continue;
          const monto = typeof pd.monto === "number" && pd.monto > 0 ? pd.monto : 0;
          if (monto <= 0) continue;
          const metodo =
            pd.metodoPago === "transferencia" || pd.metodoPago === "efectivo"
              ? (pd.metodoPago as string)
              : null;
          const empleadoIdRegistro =
            typeof pd.empleadoId === "string" ? pd.empleadoId.trim() : "";
          pagosRaw.push({
            pagoId: p.id,
            prestamoId: pdoc.id,
            fechaMs,
            monto: round2(monto),
            metodoPago: metodo,
            empleadoIdRegistro,
          });
        }
      })
    );
  }

  const byPrestamo = new Map<string, PagoRow[]>();
  for (const row of pagosRaw) {
    const list = byPrestamo.get(row.prestamoId) ?? [];
    list.push(row);
    byPrestamo.set(row.prestamoId, list);
  }

  const cobros: CobroDiaSnapshotItem[] = [];

  for (const [prestamoId, rows] of Array.from(byPrestamo.entries())) {
    rows.sort((a, b) => a.fechaMs - b.fechaMs);
    const meta = prestamoMeta.get(prestamoId);
    const saldoActual = meta?.saldoPendienteActual ?? 0;
    const totalAPagarPrestamo = meta?.totalAPagar ?? 0;
    const numeroCuotasPrestamo = meta?.numeroCuotas ?? 0;
    const cid = meta?.clienteId ?? "";
    const nombre = clienteNombre.get(cid) ?? "—";
    const totalDiaPrestamo = round2(rows.reduce((s, r) => s + r.monto, 0));
    let prefijo = 0;
    for (const row of rows) {
      prefijo = round2(prefijo + row.monto);
      const saldoTras = round2(saldoActual + totalDiaPrestamo - prefijo);
      const cuotasFalt = cuotasFaltantesEstimadas(saldoTras, totalAPagarPrestamo, numeroCuotasPrestamo);
      const f = row.fechaMs > 0 ? new Date(row.fechaMs).toISOString() : null;
      cobros.push({
        pagoId: row.pagoId,
        prestamoId,
        clienteId: cid,
        clienteNombre: nombre,
        monto: row.monto,
        metodoPago: row.metodoPago,
        fecha: f,
        totalAPagar: totalAPagarPrestamo,
        saldoPendienteTrasPago: saldoTras,
        saldoPendientePrestamoActual: saldoActual,
        cuotasFaltantes: cuotasFalt,
        numeroCuotas: numeroCuotasPrestamo,
      });
    }
  }

  cobros.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  let totalCobrosAcreditanTuCaja = 0;
  for (const row of pagosRaw) {
    const titular = prestamoMeta.get(row.prestamoId)?.empleadoTitularId ?? "";
    const vaATuCaja = titular
      ? titular === empleadoUid
      : row.empleadoIdRegistro === empleadoUid;
    if (vaATuCaja) totalCobrosAcreditanTuCaja += row.monto;
  }
  totalCobrosAcreditanTuCaja = round2(totalCobrosAcreditanTuCaja);

  const noPagos: NoPagoDiaSnapshotItem[] = noPagosRaw.map((row) => {
    const meta = prestamoMeta.get(row.prestamoId);
    const cid = meta?.clienteId ?? "";
    const nombre = clienteNombre.get(cid) ?? "—";
    const saldoActual = meta?.saldoPendienteActual ?? 0;
    const totalAPagar = meta?.totalAPagar ?? 0;
    const numeroCuotas = meta?.numeroCuotas ?? 0;
    const cuotasPend = cuotasFaltantesEstimadas(saldoActual, totalAPagar, numeroCuotas);
    const fechaIso = row.fechaMs > 0 ? new Date(row.fechaMs).toISOString() : null;
    return {
      pagoId: row.pagoId,
      prestamoId: row.prestamoId,
      clienteId: cid,
      clienteNombre: nombre,
      fecha: fechaIso,
      motivoNoPago: row.motivoNoPago,
      nota: row.nota,
      saldoPendientePrestamoActual: round2(saldoActual),
      totalAPagar: round2(totalAPagar),
      numeroCuotas,
      cuotasPendientes: cuotasPend,
    };
  });
  noPagos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  const totalCobrosLista = round2(cobros.reduce((s, c) => s + c.monto, 0));

  const [legacyG, nuevoG] = await Promise.all([
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_SUBCOLLECTION)
      .where("empleadoId", "==", empleadoUid)
      .limit(400)
      .get(),
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
      .where("empleadoId", "==", empleadoUid)
      .limit(400)
      .get(),
  ]);

  let totalGastosDia = 0;
  const gastosDetalle: GastoDiaSnapshotItem[] = [];
  const addGastoDocs = (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
    for (const d of snap.docs) {
      const g = d.data();
      const f = g.fecha as { toDate?: () => Date } | undefined;
      const dt = f?.toDate?.();
      if (!dt) continue;
      const diaGasto = fechaDiaCalendarioDesdeISO(dt.toISOString());
      if (diaGasto !== fechaDia) continue;
      const m = typeof g.monto === "number" ? g.monto : 0;
      if (m <= 0) continue;
      totalGastosDia += m;
      const tipoRaw = typeof g.tipo === "string" ? g.tipo : null;
      gastosDetalle.push({
        id: d.id,
        monto: round2(m),
        descripcion: typeof g.descripcion === "string" ? g.descripcion : "",
        fecha: dt.toISOString(),
        motivo: etiquetaMotivoGastoTipo(tipoRaw),
      });
    }
  };
  addGastoDocs(legacyG);
  addGastoDocs(nuevoG);
  totalGastosDia = round2(totalGastosDia);

  const asignSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid)
    .collection(ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION)
    .where("fecha", ">=", startTs)
    .where("fecha", "<=", endTs)
    .get();

  let totalBaseAsignadaDia = 0;
  for (const d of asignSnap.docs) {
    const x = d.data() as Record<string, unknown>;
    const rid = typeof x.rutaId === "string" ? x.rutaId.trim() : "";
    if (rid !== rutaId) continue;
    const m =
      typeof x.monto === "number" && Number.isFinite(x.monto) ? x.monto : 0;
    if (m > 0) totalBaseAsignadaDia += m;
  }
  totalBaseAsignadaDia = round2(totalBaseAsignadaDia);

  const prestamosDesembolsoDelDia: PrestamoDesembolsoDiaSnapshotItem[] = [];
  for (const d of prestamosSnap.docs) {
    const x = d.data() as Record<string, unknown>;
    const origen = typeof x.desembolsoDesde === "string" ? x.desembolsoDesde.trim() : "";
    if (origen !== "caja_empleado") continue;
    const empTit = typeof x.empleadoId === "string" ? x.empleadoId.trim() : "";
    if (empTit !== empleadoUid) continue;

    const creadoEn = x.creadoEn as { toDate?: () => Date } | undefined;
    if (typeof creadoEn?.toDate !== "function") continue;
    const dt = creadoEn.toDate();
    const dia = fechaDiaCalendarioDesdeISO(dt.toISOString());
    if (dia !== fechaDia) continue;

    const monto =
      typeof x.monto === "number" && Number.isFinite(x.monto) && x.monto > 0 ? round2(x.monto) : 0;
    if (monto <= 0) continue;
    const clienteId = typeof x.clienteId === "string" ? x.clienteId.trim() : "";
    const nombre = clienteNombre.get(clienteId) ?? "—";
    const totalAPagarPrest =
      typeof x.totalAPagar === "number" && Number.isFinite(x.totalAPagar)
        ? round2(x.totalAPagar)
        : 0;
    prestamosDesembolsoDelDia.push({
      prestamoId: d.id,
      clienteId,
      clienteNombre: nombre,
      monto,
      fecha: dt.toISOString(),
      totalAPagar: totalAPagarPrest,
    });
  }
  prestamosDesembolsoDelDia.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const totalPrestamosDesembolsoDia = round2(
    prestamosDesembolsoDelDia.reduce((s, p) => s + p.monto, 0)
  );

  const tuCajaDelDia = tuCajaDelDiaFormula(
    totalCobrosLista,
    totalBaseAsignadaDia,
    totalGastosDia,
    totalPrestamosDesembolsoDia
  );

  return {
    fechaDia,
    rutaId,
    cobros,
    noPagos,
    totalCobrosLista,
    tuCajaDelDia,
    totalCobrosAcreditanTuCaja,
    totalGastosDia,
    gastosDelDia: gastosDetalle,
    totalBaseAsignadaDia,
    prestamosDesembolsoDelDia,
    totalPrestamosDesembolsoDia,
  };
}
