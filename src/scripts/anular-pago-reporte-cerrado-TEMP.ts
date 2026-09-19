/**
 * TEMPORAL — anula un cobro cuando el reporte del día ya está aprobado.
 * Reutiliza la lógica del API oficial, omitiendo solo REPORTE_APROBADO.
 *
 * Uso (buscar cobro):
 *   npx tsx src/scripts/anular-pago-reporte-cerrado-TEMP.ts --dry-run --buscar \
 *     --cliente="Felipe gonzalez" --monto=1200 --ruta=ALREDEDORES --fecha=2026-09-02
 *
 * Uso (IDs directos):
 *   npx tsx src/scripts/anular-pago-reporte-cerrado-TEMP.ts --dry-run \
 *     --empresa=<id> --prestamo=<id> --pago=<id> --admin=<uid>
 *
 * Ejecutar:
 *   CONFIRM=1 npx tsx src/scripts/anular-pago-reporte-cerrado-TEMP.ts \
 *     --empresa=... --prestamo=... --pago=... --admin=... --motivo="..."
 */

import path from "path";
import dotenv from "dotenv";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

for (const p of [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")]) {
  dotenv.config({ path: p });
}

import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  PERIODOS_ADMIN_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  validarElegibilidadAnulacion,
  validarCoherenciaPrestamoConPago,
  determinarModoReversion,
  calcularReversion,
  inferirAcreditaCajaRuta,
  mensajeElegibilidad,
  type DatosPago,
  type DatosPrestamo,
  type DatosRuta,
  type DatosEmpleado,
  type AnulacionElegibilidadError,
} from "@/lib/anular-pago-prestamo";
import {
  buildAnulacionLedgerDebits,
  drainLedgerOutbox,
  enqueueLedgerOutboxInTx,
  isFinancialLedgerEnabled,
  markPagoLedgerStatus,
} from "@/lib/financial-ledger";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { gastoOcurreEnRangoContable } from "@/lib/gastos-periodo-filter";
import { deltaTotalPrestamosActivosPorCambioEstado } from "@/lib/total-prestamos-activos";
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
  inicioDiaColombiaUtc,
  finDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";

const ELEGIBILIDAD_CODES = [
  "PAGO_NO_ACTIVO",
  "PAGO_TIPO_INVALIDO",
  "PAGO_FUERA_DE_PERIODO_ABIERTO",
  "PAGO_NO_ES_ULTIMO",
  "SIN_SNAPSHOTS_NI_FALLBACK",
  "REPORTE_APROBADO",
  "PRESTAMO_DESCUADRADO",
] as const;

function arg(name: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : "";
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fechaDesdeFirestore(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

function buildRangoDesdeQuerySnap(
  snap: FirebaseFirestore.QuerySnapshot
): { desde: Date; hasta: Date } | null {
  if (snap.empty) return null;
  const fechaAperturaRaw = snap.docs[0].data().fechaApertura;
  const desde =
    fechaAperturaRaw instanceof Timestamp
      ? fechaAperturaRaw.toDate()
      : fechaAperturaRaw instanceof Date
        ? fechaAperturaRaw
        : null;
  if (!desde) return null;
  return { desde, hasta: new Date() };
}

function mapDatosPago(pd: Record<string, unknown>): DatosPago {
  return {
    estado: typeof pd.estado === "string" ? pd.estado : "activo",
    tipo: typeof pd.tipo === "string" ? pd.tipo : "pago",
    monto: typeof pd.monto === "number" ? pd.monto : 0,
    cuotaCapital: typeof pd.cuotaCapital === "number" ? pd.cuotaCapital : 0,
    cuotaGanancia: typeof pd.cuotaGanancia === "number" ? pd.cuotaGanancia : 0,
    inversionesDescontadas:
      typeof pd.inversionesDescontadas === "number" ? pd.inversionesDescontadas : undefined,
    gananciaAplicada:
      typeof pd.gananciaAplicada === "number" ? pd.gananciaAplicada : undefined,
    acreditaCajaRuta: inferirAcreditaCajaRuta(pd),
    tieneSnapshotsCompletos: pd.tieneSnapshotsCompletos === true,
    saldoPendienteAntes:
      typeof pd.saldoPendienteAntes === "number" ? pd.saldoPendienteAntes : undefined,
    saldoPendienteDespues:
      typeof pd.saldoPendienteDespues === "number" ? pd.saldoPendienteDespues : undefined,
    adelantoCuotaAntes:
      typeof pd.adelantoCuotaAntes === "number" ? pd.adelantoCuotaAntes : undefined,
    adelantoCuotaDespues:
      typeof pd.adelantoCuotaDespues === "number" ? pd.adelantoCuotaDespues : undefined,
    estadoPrestamoAntes:
      typeof pd.estadoPrestamoAntes === "string" ? pd.estadoPrestamoAntes : undefined,
    estadoPrestamoDespues:
      typeof pd.estadoPrestamoDespues === "string" ? pd.estadoPrestamoDespues : undefined,
    fecha: fechaDesdeFirestore(pd.fecha),
    empleadoId: typeof pd.empleadoId === "string" ? pd.empleadoId : "",
    intentosFallidosAntes:
      typeof pd.intentosFallidosAntes === "number" ? pd.intentosFallidosAntes : 0,
    ultimoPagoIdAnterior:
      typeof pd.ultimoPagoIdAnterior === "string" ? pd.ultimoPagoIdAnterior : null,
  };
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

type Target = {
  empresaId: string;
  prestamoId: string;
  pagoId: string;
  adminUid: string;
};

async function buscarCobro(
  db: Firestore,
  params: {
    cliente: string;
    monto: number;
    ruta: string;
    fechaDia: string;
  }
): Promise<Target[]> {
  const start = inicioDiaColombiaUtc(params.fechaDia);
  const end = finDiaColombiaUtc(params.fechaDia);
  if (!start || !end) throw new Error("Fecha inválida");

  const snap = await db
    .collectionGroup(PAGOS_SUBCOLLECTION)
    .where("fecha", ">=", Timestamp.fromDate(start))
    .where("fecha", "<=", Timestamp.fromDate(end))
    .get();

  const clienteNorm = norm(params.cliente);
  const rutaNorm = norm(params.ruta);

  const matches: Target[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if ((d.estado ?? "activo") === "anulado") continue;
    if (d.tipo !== "pago") continue;
    const monto = typeof d.monto === "number" ? d.monto : 0;
    if (Math.abs(monto - params.monto) > 0.01) continue;

    const clienteNombre =
      typeof d.clienteNombre === "string" ? d.clienteNombre : "";
    const rutaNombre = typeof d.rutaNombre === "string" ? d.rutaNombre : "";
    if (!norm(clienteNombre).includes(clienteNorm)) continue;
    if (!norm(rutaNombre).includes(rutaNorm)) continue;

    const empresaId = typeof d.empresaId === "string" ? d.empresaId : "";
    const adminUid = typeof d.adminId === "string" ? d.adminId : "";
    const prestamoId = typeof d.prestamoId === "string" ? d.prestamoId : "";
    if (!empresaId || !adminUid || !prestamoId) continue;

    matches.push({ empresaId, prestamoId, pagoId: doc.id, adminUid });
  }

  return matches;
}

async function previewAnulacion(
  db: Firestore,
  target: Target,
  bypassReporte: boolean
) {
  const { empresaId, prestamoId, pagoId, adminUid } = target;

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId);
  const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc(pagoId);

  const [prestamoSnap, pagoSnap] = await Promise.all([prestamoRef.get(), pagoRef.get()]);
  if (!prestamoSnap.exists) throw new Error("Préstamo no encontrado");
  if (!pagoSnap.exists) throw new Error("Pago no encontrado");

  const pr = prestamoSnap.data()!;
  const pd = pagoSnap.data() as Record<string, unknown>;

  if (pr.adminId !== adminUid) {
    throw new Error(`adminId del préstamo (${pr.adminId}) no coincide con ${adminUid}`);
  }

  const pago = mapDatosPago(pd);

  const periodoSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PERIODOS_ADMIN_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .where("estado", "==", "abierto")
    .limit(1)
    .get();

  const rango = buildRangoDesdeQuerySnap(periodoSnap);
  const enPeriodoAbierto =
    rango !== null &&
    gastoOcurreEnRangoContable(pago.fecha.toISOString(), rango.desde, rango.hasta);

  const esUltimoPago =
    (typeof pr.ultimoPagoId === "string" ? pr.ultimoPagoId : null) === pagoId;

  const elegibilidad = validarElegibilidadAnulacion({
    pago,
    enPeriodoAbierto,
    esUltimoPago,
    reporteAprobado: bypassReporte ? false : true,
  });

  let modo: ReturnType<typeof determinarModoReversion>;
  try {
    modo = determinarModoReversion(pago);
  } catch {
    throw new Error(mensajeElegibilidad("SIN_SNAPSHOTS_NI_FALLBACK"));
  }

  const prestamo: DatosPrestamo = {
    saldoPendiente: (pr.saldoPendiente as number) ?? 0,
    adelantoCuota: (pr.adelantoCuota as number) ?? 0,
    estado: (pr.estado as string) ?? "activo",
    fechaCierre: pr.fechaCierre ?? null,
  };

  const coherencia = validarCoherenciaPrestamoConPago(prestamo, pago, modo);

  const rutaId =
    (typeof pd.rutaId === "string" ? pd.rutaId.trim() : "") ||
    (typeof pr.rutaId === "string" ? pr.rutaId.trim() : "");

  let ruta: DatosRuta = {
    cajaRuta: 0,
    cajasEmpleados: 0,
    inversiones: 0,
    ganancias: 0,
    perdidas: 0,
  };
  if (rutaId) {
    const rutaSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(RUTAS_SUBCOLLECTION)
      .doc(rutaId)
      .get();
    if (rutaSnap.exists) {
      const rd = rutaSnap.data()!;
      ruta = {
        cajaRuta: typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0,
        cajasEmpleados: typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0,
        inversiones: typeof rd.inversiones === "number" ? rd.inversiones : 0,
        ganancias: typeof rd.ganancias === "number" ? rd.ganancias : 0,
        perdidas: typeof rd.perdidas === "number" ? rd.perdidas : 0,
      };
    }
  }

  let empleado: DatosEmpleado = pago.acreditaCajaRuta ? null : { cajaEmpleado: 0 };
  if (!pago.acreditaCajaRuta && pago.empleadoId) {
    const uSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(pago.empleadoId)
      .get();
    if (uSnap.exists) {
      empleado = {
        cajaEmpleado:
          typeof uSnap.data()?.cajaEmpleado === "number" ? uSnap.data()!.cajaEmpleado : 0,
      };
    }
  }

  const rev = calcularReversion({ pago, prestamo, ruta, empleado, modo });

  return {
    pd,
    pr,
    pago,
    ruta,
    modo,
    elegibilidad,
    coherencia,
    enPeriodoAbierto,
    esUltimoPago,
    rev,
    rutaId,
  };
}

async function ejecutarAnulacion(
  db: Firestore,
  target: Target,
  adminUid: string,
  motivoAnulacion: string
) {
  const { empresaId, prestamoId, pagoId } = target;
  const hoy = fechaDiaColombiaHoy();

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId);
  const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc(pagoId);

  const pagoPreSnap = await pagoRef.get();
  if (!pagoPreSnap.exists) throw new Error("Pago no encontrado");
  const pagoPre = mapDatosPago(pagoPreSnap.data() as Record<string, unknown>);
  const fechaDiaPago = fechaDiaCalendarioDesdeISO(pagoPre.fecha.toISOString());

  const pagosActivosSnap = await prestamoRef
    .collection(PAGOS_SUBCOLLECTION)
    .where("tipo", "==", "pago")
    .orderBy("fecha", "desc")
    .limit(5)
    .get();

  const pagosActivos = pagosActivosSnap.docs.filter(
    (d) => (d.data().estado ?? "activo") !== "anulado"
  );
  const ultimoPagoFechaRestaurar =
    pagosActivos.length > 1 ? (pagosActivos[1].data().fecha ?? null) : null;

  const result = await db.runTransaction(async (tx) => {
    const pagoSnap = await tx.get(pagoRef);
    const prestamoSnap = await tx.get(prestamoRef);

    if (!pagoSnap.exists) throw new Error("PAGO_NOT_FOUND");
    if (!prestamoSnap.exists) throw new Error("PRESTAMO_NOT_FOUND");

    const pd = pagoSnap.data()!;
    const pr = prestamoSnap.data()!;

    const pago = mapDatosPago(pd as Record<string, unknown>);
    const prestamo: DatosPrestamo = {
      saldoPendiente: (pr.saldoPendiente as number) ?? 0,
      adelantoCuota: (pr.adelantoCuota as number) ?? 0,
      estado: (pr.estado as string) ?? "activo",
      fechaCierre: pr.fechaCierre ?? null,
    };

    const periodoQueryTx = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(PERIODOS_ADMIN_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .where("estado", "==", "abierto")
      .limit(1);
    const periodoSnapTx = await tx.get(periodoQueryTx);
    const rangoPeriodoAbiertoTx = buildRangoDesdeQuerySnap(periodoSnapTx);
    const enPeriodoAbiertoTx =
      rangoPeriodoAbiertoTx !== null &&
      gastoOcurreEnRangoContable(
        pago.fecha.toISOString(),
        rangoPeriodoAbiertoTx.desde,
        rangoPeriodoAbiertoTx.hasta
      );

    const ultimoPagoIdEnPrestamo =
      typeof pr.ultimoPagoId === "string" ? pr.ultimoPagoId : null;
    const esUltimoPagoTx =
      ultimoPagoIdEnPrestamo !== null ? ultimoPagoIdEnPrestamo === pagoId : true;

    // Bypass intencional: reporteAprobado = false (script TEMP para reportes cerrados)
    const elegibilidadError = validarElegibilidadAnulacion({
      pago,
      enPeriodoAbierto: enPeriodoAbiertoTx,
      esUltimoPago: esUltimoPagoTx,
      reporteAprobado: false,
    });
    if (elegibilidadError) throw new Error(elegibilidadError);

    let modo: ReturnType<typeof determinarModoReversion>;
    try {
      modo = determinarModoReversion(pago);
    } catch {
      throw new Error("SIN_SNAPSHOTS_NI_FALLBACK");
    }

    const coherenciaError = validarCoherenciaPrestamoConPago(prestamo, pago, modo);
    if (coherenciaError) throw new Error(coherenciaError);

    const rutaId =
      (typeof pd.rutaId === "string" ? pd.rutaId.trim() : "") ||
      (typeof pr.rutaId === "string" ? pr.rutaId.trim() : "");

    const rutaRef = rutaId
      ? db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(RUTAS_SUBCOLLECTION)
          .doc(rutaId)
      : null;

    let rutaSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (rutaRef) {
      rutaSnap = await tx.get(rutaRef);
      if (!rutaSnap.exists) throw new Error("RUTA_NOT_FOUND");
    }

    const empleadoCobrador = !pago.acreditaCajaRuta ? pago.empleadoId : null;
    const usuarioEmpRef = empleadoCobrador
      ? db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(USUARIOS_SUBCOLLECTION)
          .doc(empleadoCobrador)
      : null;

    let uSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    if (usuarioEmpRef) uSnap = await tx.get(usuarioEmpRef);

    const rutaData = rutaSnap?.data() ?? {};
    const ruta: DatosRuta = {
      cajaRuta: typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0,
      cajasEmpleados:
        typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0,
      inversiones: typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0,
      ganancias: typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0,
      perdidas: typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0,
    };

    const empleadoData = uSnap?.exists ? uSnap.data()! : null;
    const empleado: DatosEmpleado = empleadoData
      ? {
          cajaEmpleado:
            typeof empleadoData.cajaEmpleado === "number" ? empleadoData.cajaEmpleado : 0,
        }
      : pago.acreditaCajaRuta
        ? null
        : { cajaEmpleado: 0 };

    const rev = calcularReversion({ pago, prestamo, ruta, empleado, modo });
    const nowTx = new Date();
    const ultimoPagoFechaAnteriorTx = pd.ultimoPagoFechaAnterior ?? ultimoPagoFechaRestaurar;

    tx.update(pagoRef, {
      estado: "anulado",
      anuladoEn: nowTx,
      anuladoPorUid: adminUid,
      motivoAnulacion,
      reversionModo: modo,
      anuladoViaScriptTemp: true,
    });

    const prestamoUpdate: Record<string, unknown> = {
      saldoPendiente: rev.nuevoSaldoPendiente,
      adelantoCuota: rev.nuevoAdelantoCuota,
      estado: rev.nuevoEstadoPrestamo,
      updatedAt: nowTx,
      intentosFallidos: rev.intentosFallidosRestaurados,
      ultimoPagoFecha: ultimoPagoFechaAnteriorTx ?? FieldValue.delete(),
      ultimoPagoId: pago.ultimoPagoIdAnterior ?? FieldValue.delete(),
    };
    if (rev.reabrePrestamo) {
      prestamoUpdate.fechaCierre = FieldValue.delete();
      prestamoUpdate.cerradoPor = FieldValue.delete();
    }
    tx.update(prestamoRef, prestamoUpdate);

    if (rutaRef) {
      tx.update(rutaRef, {
        cajaRuta: rev.nuevaCajaRuta,
        cajasEmpleados: rev.nuevosCajasEmpleados,
        inversiones: rev.nuevasInversiones,
        ganancias: rev.nuevasGanancias,
        capitalTotal: rev.nuevoCapitalTotal,
        cobradoAcumulado: FieldValue.increment(-pago.monto),
        ultimaActualizacion: nowTx,
      });
    }

    if (usuarioEmpRef && rev.nuevaCajaEmpleado !== null) {
      tx.update(usuarioEmpRef, {
        cajaEmpleado: rev.nuevaCajaEmpleado,
        ultimaActualizacionCapital: nowTx,
      });
    }

    if (rev.reabrePrestamo) {
      const clienteId = typeof pr.clienteId === "string" ? pr.clienteId.trim() : "";
      if (clienteId) {
        const clienteRef = db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(CLIENTES_SUBCOLLECTION)
          .doc(clienteId);
        tx.update(clienteRef, { prestamo_activo: true });
      }
    }

    const adminIdPrestamo =
      typeof pr.adminId === "string" && pr.adminId.trim() ? pr.adminId.trim() : adminUid;
    const deltaContador = deltaTotalPrestamosActivosPorCambioEstado({
      estadoAntes: prestamo.estado,
      estadoDespues: rev.nuevoEstadoPrestamo,
    });
    if (deltaContador !== 0) {
      tx.set(
        db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(USUARIOS_SUBCOLLECTION)
          .doc(adminIdPrestamo),
        { totalPrestamosActivos: FieldValue.increment(deltaContador) },
        { merge: true }
      );
    }

    const walletBalanceAfterAnul = pago.acreditaCajaRuta
      ? rev.nuevaCajaRuta
      : rev.nuevaCajaEmpleado;
    const ledgerSpecs = buildAnulacionLedgerDebits({
      acreditaCajaRuta: pago.acreditaCajaRuta,
      rutaId,
      empleadoId: empleadoCobrador,
      pagoId,
      cuotaCapital: pago.cuotaCapital,
      cuotaGanancia: pago.cuotaGanancia,
      walletBalanceAfter: walletBalanceAfterAnul,
      createdBy: adminUid,
      prestamoId,
      modo,
    });
    const ledgerOperationIds = enqueueLedgerOutboxInTx(tx, db, empresaId, ledgerSpecs);
    if (isFinancialLedgerEnabled()) {
      tx.set(
        pagoRef,
        { ledgerStatus: ledgerOperationIds.length > 0 ? "pending" : "skipped" },
        { merge: true }
      );
    }

    return {
      rutaId,
      modo,
      nuevoSaldoPendiente: rev.nuevoSaldoPendiente,
      reabrePrestamo: rev.reabrePrestamo,
      ledgerOperationIds,
      empleadoId: empleadoCobrador,
      nuevaCajaEmpleado: rev.nuevaCajaEmpleado,
      fechaDiaPago: fechaDiaPago ?? hoy,
    };
  });

  if (result.rutaId) {
    const rutaRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(RUTAS_SUBCOLLECTION)
      .doc(result.rutaId);
    const rutaAfter = await rutaRef.get();
    if (rutaAfter.exists) {
      await upsertCapitalRutaSnapshot(db, empresaId, result.rutaId, rutaAfter.data()!);
    }
  }

  if (result.ledgerOperationIds.length > 0) {
    const drain = await drainLedgerOutbox(db, empresaId, result.ledgerOperationIds);
    await markPagoLedgerStatus({
      db,
      empresaId,
      prestamoId,
      pagoId,
      status: drain.failed > 0 ? "pending" : "committed",
    });
  }

  return result;
}

function printPreview(target: Target, preview: Awaited<ReturnType<typeof previewAnulacion>>) {
  const { pd, pr, pago, modo, elegibilidad, coherencia, rev, ruta } = preview;
  console.log("\n=== Cobro encontrado ===");
  console.log({
    empresaId: target.empresaId,
    prestamoId: target.prestamoId,
    pagoId: target.pagoId,
    adminUid: target.adminUid,
    cliente: pd.clienteNombre,
    monto: pago.monto,
    metodo: pd.metodoPago,
    ruta: pd.rutaNombre,
    fecha: pago.fecha.toISOString(),
    empleadoId: pago.empleadoId,
  });
  console.log("\n=== Validaciones (con bypass REPORTE_APROBADO) ===");
  console.log({
    enPeriodoAbierto: preview.enPeriodoAbierto,
    esUltimoPago: preview.esUltimoPago,
    elegibilidad: elegibilidad ?? "OK",
    coherencia: coherencia ?? "OK",
    modo,
  });
  console.log("\n=== Cambios previstos ===");
  console.log({
    saldoPendiente: `${pr.saldoPendiente} → ${rev.nuevoSaldoPendiente}`,
    cajasEmpleados: `${preview.ruta.cajasEmpleados} → ${rev.nuevosCajasEmpleados}`,
    cajaEmpleado:
      rev.nuevaCajaEmpleado !== null
        ? `${rev.nuevaCajaEmpleado + pago.monto} → ${rev.nuevaCajaEmpleado}`
        : "N/A (admin/transferencia)",
    reabrePrestamo: rev.reabrePrestamo,
  });

  if (elegibilidad && elegibilidad !== "REPORTE_APROBADO") {
    throw new Error(mensajeElegibilidad(elegibilidad));
  }
  if (coherencia) {
    throw new Error(mensajeElegibilidad(coherencia));
  }
  if (!preview.enPeriodoAbierto) {
    throw new Error(mensajeElegibilidad("PAGO_FUERA_DE_PERIODO_ABIERTO"));
  }
  if (!preview.esUltimoPago) {
    throw new Error(mensajeElegibilidad("PAGO_NO_ES_ULTIMO"));
  }
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const confirm = process.env.CONFIRM === "1";
  const buscar = hasFlag("buscar");
  const motivo =
    arg("motivo") || "Anulación manual — reporte ya aprobado (script TEMP)";

  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const db = getAdminFirestore();

  let target: Target;

  if (buscar) {
    const cliente = arg("cliente");
    const monto = Number(arg("monto"));
    const ruta = arg("ruta");
    const fechaDia = arg("fecha") || fechaDiaColombiaHoy();

    if (!cliente || !Number.isFinite(monto) || !ruta) {
      console.error("Con --buscar necesitás --cliente, --monto y --ruta");
      process.exit(1);
    }

    console.log(`Buscando cobro: cliente="${cliente}", monto=${monto}, ruta="${ruta}", fecha=${fechaDia}`);
    const matches = await buscarCobro(db, { cliente, monto, ruta, fechaDia });

    if (matches.length === 0) {
      console.error("No se encontró ningún cobro activo con esos criterios.");
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error("Se encontraron varios cobros. Especificá IDs manualmente:");
      matches.forEach((m, i) => console.log(i + 1, m));
      process.exit(1);
    }
    target = matches[0]!;
    console.log("Cobro único encontrado.");
  } else {
    const empresaId = arg("empresa");
    const prestamoId = arg("prestamo");
    const pagoId = arg("pago");
    const adminUid = arg("admin");
    if (!empresaId || !prestamoId || !pagoId || !adminUid) {
      console.error(
        "Usá --buscar o pasá --empresa, --prestamo, --pago y --admin"
      );
      process.exit(1);
    }
    target = { empresaId, prestamoId, pagoId, adminUid };
  }

  const preview = await previewAnulacion(db, target, true);
  printPreview(target, preview);

  if (dryRun || !confirm) {
    console.log("\n✓ Dry-run completado. Para ejecutar:");
    console.log(
      `  $env:CONFIRM="1"; npx tsx src/scripts/anular-pago-reporte-cerrado-TEMP.ts ` +
        `--empresa=${target.empresaId} --prestamo=${target.prestamoId} --pago=${target.pagoId} --admin=${target.adminUid} ` +
        `--motivo="${motivo.replace(/"/g, '\\"')}"`
    );
    return;
  }

  console.log("\n>>> Ejecutando anulación...");
  const result = await ejecutarAnulacion(db, target, target.adminUid, motivo);
  console.log("\n✓ Anulación completada:");
  console.log({
    nuevoSaldoPendiente: result.nuevoSaldoPendiente,
    modo: result.modo,
    reabrePrestamo: result.reabrePrestamo,
    ledgerOps: result.ledgerOperationIds.length,
  });
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (ELEGIBILIDAD_CODES.includes(msg as AnulacionElegibilidadError)) {
    console.error("Error de elegibilidad:", mensajeElegibilidad(msg as AnulacionElegibilidadError));
  } else {
    console.error(e);
  }
  process.exit(1);
});
