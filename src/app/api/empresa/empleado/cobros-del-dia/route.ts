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

/** GET: cobros (cuotas pagadas) del día para el trabajador + totales y caja (`cajaEmpleado`). ?fecha=YYYY-MM-DD (Colombia). */
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
    { clienteId: string; saldoPendienteActual: number }
  >();
  const clienteIds = new Set<string>();

  for (const d of prestamosSnap.docs) {
    const x = d.data() as Record<string, unknown>;
    const clienteId = typeof x.clienteId === "string" ? x.clienteId.trim() : "";
    const saldo =
      typeof x.saldoPendiente === "number" && Number.isFinite(x.saldoPendiente)
        ? x.saldoPendiente
        : 0;
    prestamoMeta.set(d.id, { clienteId, saldoPendienteActual: round2(saldo) });
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
  };

  const pagosRaw: PagoRow[] = [];

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
          if ((pd.tipo as string) !== "pago") continue;
          const monto = typeof pd.monto === "number" && pd.monto > 0 ? pd.monto : 0;
          if (monto <= 0) continue;
          const f = pd.fecha as { toMillis?: () => number } | undefined;
          const fechaMs = typeof f?.toMillis === "function" ? f.toMillis() : 0;
          const metodo =
            pd.metodoPago === "transferencia" || pd.metodoPago === "efectivo"
              ? (pd.metodoPago as string)
              : null;
          pagosRaw.push({
            pagoId: p.id,
            prestamoId: pdoc.id,
            fechaMs,
            monto: round2(monto),
            metodoPago: metodo,
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

  const totalCobrosLista = round2(cobros.reduce((s, c) => s + c.monto, 0));

  const usuarioSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(apiUser.uid)
    .get();
  let cajaEmpleado = 0;
  if (usuarioSnap.exists) {
    const ud = usuarioSnap.data() as Record<string, unknown>;
    cajaEmpleado =
      typeof ud.cajaEmpleado === "number" ? round2(ud.cajaEmpleado) : 0;
  }

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

  let totalBaseAsignadaDia = 0;
  try {
    const asignSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(apiUser.uid)
      .collection(ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION)
      .where("fecha", ">=", Timestamp.fromDate(start))
      .where("fecha", "<=", Timestamp.fromDate(end))
      .get();
    for (const d of asignSnap.docs) {
      const x = d.data() as Record<string, unknown>;
      const mo = typeof x.monto === "number" && Number.isFinite(x.monto) ? x.monto : 0;
      if (mo > 0) totalBaseAsignadaDia += mo;
    }
    totalBaseAsignadaDia = round2(totalBaseAsignadaDia);
  } catch {
    totalBaseAsignadaDia = 0;
  }

  /**
   * Saldo en documento (`cajaEmpleado`) + cobros del día − gastos del día.
   * Coincide con la tarjeta «Caja (efectivo)» + «Total cobrado» − «Gastos» en esta misma respuesta.
   */
  const cajaTotalDelDia = round2(cajaEmpleado + totalCobrosLista - totalGastosDia);

  return NextResponse.json({
    fechaDia,
    rutaId,
    cobros,
    totalCobrosLista,
    totalGastosDia,
    totalBaseAsignadaDia,
    cajaTotalDelDia,
    gastosDelDia: gastosDetalle,
    cajaEmpleado,
    cajaDelDia: {
      cobrosDelDia: totalCobrosLista,
      gastosDelDia: totalGastosDia,
      totalBaseAsignadaDia,
      cajaTotalDelDia,
      /** Saldo operativo actual (`usuarios.cajaEmpleado`). */
      cajaEsperadaDelDia: cajaEmpleado,
    },
  });
}
