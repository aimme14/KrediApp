import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
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
  fechaDiaColombiaHoy,
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
  parseFechaDiaColombia,
} from "@/lib/colombia-day-bounds";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type CobroDiaItemApi = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  metodoPago: string | null;
  fecha: string | null;
  saldoPendienteTrasPago: number;
  saldoPendientePrestamoActual: number;
};

/** Visitas sin cobro registradas ese día por este trabajador (`tipo: no_pago`). */
export type NoPagoDiaItemApi = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  fecha: string | null;
  motivoNoPago: string;
  nota: string | null;
  saldoPendientePrestamoActual: number;
};

/** GET: cobros del día, «no pagó», totales y base asignada. La tarjeta «Tu caja» se calcula en el cliente. ?fecha=YYYY-MM-DD (Colombia). */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores" }, { status: 403 });
  }
  if (!apiUser.rutaId?.trim()) {
    return NextResponse.json({ error: "No tienes ruta asignada" }, { status: 400 });
  }

  const fechaParam = request.nextUrl.searchParams.get("fecha");
  const fechaDia =
    fechaParam && parseFechaDiaColombia(fechaParam).ok ? fechaParam : fechaDiaColombiaHoy();

  const start = inicioDiaColombiaUtc(fechaDia);
  const end = finDiaColombiaUtc(fechaDia);
  if (!start || !end) {
    return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
  }

  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;
  const rutaId = apiUser.rutaId.trim();

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
      /** Titular del préstamo (destino del cobro en billetera); si está vacío, aplica la regla del cobrador en el pago. */
      empleadoTitularId: string;
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
    prestamoMeta.set(d.id, {
      clienteId,
      saldoPendienteActual: round2(saldo),
      empleadoTitularId,
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
    /** Registro del cobro (`pagos.empleadoId`); si el préstamo no tiene titular, la caja acredita a este usuario. */
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
            if (empId !== apiUser.uid) continue;
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

  const cobros: CobroDiaItemApi[] = [];

  for (const [prestamoId, rows] of Array.from(byPrestamo.entries())) {
    rows.sort((a, b) => a.fechaMs - b.fechaMs);
    const meta = prestamoMeta.get(prestamoId);
    const saldoActual = meta?.saldoPendienteActual ?? 0;
    const cid = meta?.clienteId ?? "";
    const nombre = clienteNombre.get(cid) ?? "—";
    const totalDiaPrestamo = round2(rows.reduce((s, r) => s + r.monto, 0));
    let prefijo = 0;
    for (const row of rows) {
      prefijo = round2(prefijo + row.monto);
      const saldoTras = round2(saldoActual + totalDiaPrestamo - prefijo);
      const f = row.fechaMs > 0 ? new Date(row.fechaMs).toISOString() : null;
      cobros.push({
        pagoId: row.pagoId,
        prestamoId,
        clienteId: cid,
        clienteNombre: nombre,
        monto: row.monto,
        metodoPago: row.metodoPago,
        fecha: f,
        saldoPendienteTrasPago: saldoTras,
        saldoPendientePrestamoActual: saldoActual,
      });
    }
  }

  cobros.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  /** Alineado a `pagos` POST: caja del titular del préstamo, o del cobrador si el préstamo no tiene titular. */
  let totalCobrosAcreditanTuCaja = 0;
  for (const row of pagosRaw) {
    const titular = prestamoMeta.get(row.prestamoId)?.empleadoTitularId ?? "";
    const vaATuCaja = titular
      ? titular === apiUser.uid
      : row.empleadoIdRegistro === apiUser.uid;
    if (vaATuCaja) totalCobrosAcreditanTuCaja += row.monto;
  }
  totalCobrosAcreditanTuCaja = round2(totalCobrosAcreditanTuCaja);

  const noPagos: NoPagoDiaItemApi[] = noPagosRaw.map((row) => {
    const meta = prestamoMeta.get(row.prestamoId);
    const cid = meta?.clienteId ?? "";
    const nombre = clienteNombre.get(cid) ?? "—";
    const saldoActual = meta?.saldoPendienteActual ?? 0;
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
    };
  });
  noPagos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  const totalCobrosLista = round2(cobros.reduce((s, c) => s + c.monto, 0));

  const [legacyG, nuevoG] = await Promise.all([
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_SUBCOLLECTION)
      .where("empleadoId", "==", apiUser.uid)
      .limit(400)
      .get(),
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
      .where("empleadoId", "==", apiUser.uid)
      .limit(400)
      .get(),
  ]);

  let totalGastosDia = 0;
  const gastosDetalle: Array<{ id: string; monto: number; descripcion: string; fecha: string | null }> =
    [];
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
      gastosDetalle.push({
        id: d.id,
        monto: round2(m),
        descripcion: typeof g.descripcion === "string" ? g.descripcion : "",
        fecha: dt.toISOString(),
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
    .doc(apiUser.uid)
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

  return NextResponse.json({
    fechaDia,
    rutaId,
    cobros,
    noPagos,
    totalCobrosLista,
    totalCobrosAcreditanTuCaja,
    totalGastosDia,
    gastosDelDia: gastosDetalle,
    totalBaseAsignadaDia,
  });
}
