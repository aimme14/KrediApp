import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  REPORTES_DIA_SUBCOLLECTION,
  PERIODOS_ADMIN_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  startIdempotentOperation,
  finishIdempotentOperation,
} from "@/lib/financial-idempotency";
import { recordDebitMovement } from "@/lib/financial-ledger";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import {
  fechaDiaColombiaHoy,
  fechaDiaCalendarioDesdeISO,
} from "@/lib/colombia-day-bounds";
import { gastoOcurreEnRangoContable } from "@/lib/gastos-periodo-filter";
import {
  validarElegibilidadAnulacion,
  validarCoherenciaPrestamoConPago,
  determinarModoReversion,
  calcularReversion,
  mensajeElegibilidad,
  inferirAcreditaCajaRuta,
  type DatosPago,
  type DatosPrestamo,
  type DatosRuta,
  type DatosEmpleado,
  type AnulacionElegibilidadError,
} from "@/lib/anular-pago-prestamo";

const ELEGIBILIDAD_CODES = [
  "PAGO_NO_ACTIVO",
  "PAGO_TIPO_INVALIDO",
  "PAGO_FUERA_DE_PERIODO_ABIERTO",
  "PAGO_NO_ES_ULTIMO",
  "SIN_SNAPSHOTS_NI_FALLBACK",
  "REPORTE_APROBADO",
  "PRESTAMO_DESCUADRADO",
] as const;

function fechaDesdeFirestore(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

function mapDatosPago(pd: Record<string, unknown>): DatosPago {
  return {
    estado: typeof pd.estado === "string" ? pd.estado : "activo",
    tipo: typeof pd.tipo === "string" ? pd.tipo : "pago",
    monto: typeof pd.monto === "number" ? pd.monto : 0,
    cuotaCapital: typeof pd.cuotaCapital === "number" ? pd.cuotaCapital : 0,
    cuotaGanancia: typeof pd.cuotaGanancia === "number" ? pd.cuotaGanancia : 0,
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

/** Extrae el rango [fechaApertura, ahora] de un QuerySnapshot de periodos. */
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

async function obtenerRangoPeriodoAbiertoAdmin(
  empresaId: string,
  adminUid: string
): Promise<{ desde: Date; hasta: Date } | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PERIODOS_ADMIN_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .where("estado", "==", "abierto")
    .limit(1)
    .get();
  return buildRangoDesdeQuerySnap(snap);
}

async function existeReporteAprobadoParaEmpleado(
  empresaId: string,
  empleadoUid: string,
  fechaDia: string,
  adminUid: string
): Promise<boolean> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(REPORTES_DIA_SUBCOLLECTION)
    .where("empleadoId", "==", empleadoUid)
    .where("fechaDia", "==", fechaDia)
    .where("adminId", "==", adminUid)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pagoId: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json(
      { error: "Solo el administrador puede anular pagos." },
      { status: 403 }
    );
  }

  const { id: prestamoId, pagoId } = await params;
  const body = await request.json().catch(() => ({}));
  const { motivo, idempotencyKey } = body as {
    motivo?: string;
    idempotencyKey?: string;
  };

  const motivoAnulacion = (motivo ?? "").trim();

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId);

  const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc(pagoId);

  const prestamoPreSnap = await prestamoRef.get();
  if (!prestamoPreSnap.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado." }, { status: 404 });
  }
  const prestamoPre = prestamoPreSnap.data()!;
  if (prestamoPre.adminId !== apiUser.uid) {
    return NextResponse.json(
      { error: "No tienes permisos sobre este préstamo." },
      { status: 403 }
    );
  }

  const idem = await startIdempotentOperation({
    db,
    empresaId,
    key: idempotencyKey,
    endpoint: `prestamos:${prestamoId}:pagos:${pagoId}:anular`,
    uid: apiUser.uid,
  });
  if (idem.replay) {
    return NextResponse.json(idem.payload, { status: idem.status });
  }

  const finalize = async (status: number, payload: Record<string, unknown>) => {
    await finishIdempotentOperation({
      db,
      empresaId,
      key: idempotencyKey,
      result: { ok: status < 400, status, payload },
    });
    return NextResponse.json(payload, { status });
  };

  const hoy = fechaDiaColombiaHoy();

  const pagoPreSnap = await pagoRef.get();
  if (!pagoPreSnap.exists) {
    return finalize(404, { error: "Pago no encontrado." });
  }
  const pagoPre = mapDatosPago(pagoPreSnap.data() as Record<string, unknown>);
  const fechaDiaPago = fechaDiaCalendarioDesdeISO(pagoPre.fecha.toISOString());

  const rangoPeriodoAbierto = await obtenerRangoPeriodoAbiertoAdmin(empresaId, apiUser.uid);
  const enPeriodoAbierto =
    rangoPeriodoAbierto !== null &&
    gastoOcurreEnRangoContable(
      pagoPre.fecha.toISOString(),
      rangoPeriodoAbierto.desde,
      rangoPeriodoAbierto.hasta
    );

  if (!enPeriodoAbierto) {
    return finalize(409, { error: mensajeElegibilidad("PAGO_FUERA_DE_PERIODO_ABIERTO") });
  }

  const pagosActivosSnap = await prestamoRef
    .collection(PAGOS_SUBCOLLECTION)
    .where("tipo", "==", "pago")
    .orderBy("fecha", "desc")
    .limit(5)
    .get();

  const pagosActivos = pagosActivosSnap.docs.filter(
    (d) => (d.data().estado ?? "activo") !== "anulado"
  );
  if (pagosActivos.length === 0 || pagosActivos[0].id !== pagoId) {
    return finalize(409, { error: mensajeElegibilidad("PAGO_NO_ES_ULTIMO") });
  }

  const ultimoPagoFechaRestaurar =
    pagosActivos.length > 1 ? (pagosActivos[1].data().fecha ?? null) : null;

  if (!pagoPre.acreditaCajaRuta && pagoPre.empleadoId) {
    const reporteAprobado = await existeReporteAprobadoParaEmpleado(
      empresaId,
      pagoPre.empleadoId,
      fechaDiaPago ?? hoy,
      apiUser.uid
    );
    if (reporteAprobado) {
      return finalize(409, { error: mensajeElegibilidad("REPORTE_APROBADO") });
    }
  }

  try {
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

      // ── Re-read open period inside tx (elimina TOCTOU sobre el periodo) ──
      const periodoQueryTx = db
        .collection(EMPRESAS_COLLECTION)
        .doc(empresaId)
        .collection(PERIODOS_ADMIN_SUBCOLLECTION)
        .where("adminId", "==", apiUser.uid)
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

      // ── Re-check reporte dentro de tx (solo para cobros de empleado en efectivo) ──
      let reporteAprobadoTx = false;
      if (!pago.acreditaCajaRuta && pago.empleadoId) {
        // Nota: requiere índice compuesto (empleadoId, fechaDia, adminId) en reportes_dia
        const reporteQueryTx = db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(REPORTES_DIA_SUBCOLLECTION)
          .where("empleadoId", "==", pago.empleadoId)
          .where("fechaDia", "==", fechaDiaPago ?? hoy)
          .where("adminId", "==", apiUser.uid)
          .limit(1);
        const reporteSnapTx = await tx.get(reporteQueryTx);
        reporteAprobadoTx = !reporteSnapTx.empty;
      }

      // ── Verificar último pago dentro de tx usando ultimoPagoId (O(1) para préstamos nuevos) ──
      const ultimoPagoIdEnPrestamo =
        typeof pr.ultimoPagoId === "string" ? pr.ultimoPagoId : null;
      const esUltimoPagoTx =
        ultimoPagoIdEnPrestamo !== null
          ? ultimoPagoIdEnPrestamo === pagoId
          : true; // Legacy: préstamos sin ultimoPagoId → confiar en el chequeo pre-tx

      const elegibilidadError = validarElegibilidadAnulacion({
        pago,
        enPeriodoAbierto: enPeriodoAbiertoTx,
        esUltimoPago: esUltimoPagoTx,
        reporteAprobado: reporteAprobadoTx,
      });
      if (elegibilidadError) {
        throw new Error(elegibilidadError);
      }

      let modo: ReturnType<typeof determinarModoReversion>;
      try {
        modo = determinarModoReversion(pago);
      } catch {
        throw new Error("SIN_SNAPSHOTS_NI_FALLBACK");
      }

      const coherenciaError = validarCoherenciaPrestamoConPago(prestamo, pago, modo);
      if (coherenciaError) {
        throw new Error(coherenciaError);
      }

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
      if (usuarioEmpRef) {
        uSnap = await tx.get(usuarioEmpRef);
      }

      const rutaData = rutaSnap?.data() ?? {};
      const ruta: DatosRuta = {
        cajaRuta: typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0,
        cajasEmpleados:
          typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0,
        inversiones:
          typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0,
        ganancias: typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0,
        perdidas: typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0,
      };

      const empleadoData = uSnap?.exists ? uSnap.data()! : null;
      const empleado: DatosEmpleado = empleadoData
        ? {
            cajaEmpleado:
              typeof empleadoData.cajaEmpleado === "number"
                ? empleadoData.cajaEmpleado
                : 0,
          }
        : pago.acreditaCajaRuta
          ? null
          : { cajaEmpleado: 0 };

      const rev = calcularReversion({ pago, prestamo, ruta, empleado, modo });
      const nowTx = new Date();

      // ultimoPagoFecha: usa el snapshot guardado en el pago (nuevo), con fallback al query pre-tx (legacy)
      const ultimoPagoFechaAnteriorTx = pd.ultimoPagoFechaAnterior ?? ultimoPagoFechaRestaurar;

      tx.update(pagoRef, {
        estado: "anulado",
        anuladoEn: nowTx,
        anuladoPorUid: apiUser.uid,
        motivoAnulacion,
        reversionModo: modo,
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

      return {
        rutaId,
        reabrePrestamo: rev.reabrePrestamo,
        adminId:
          typeof pr.adminId === "string" && pr.adminId.trim()
            ? pr.adminId.trim()
            : apiUser.uid,
        modo,
        nuevoSaldoPendiente: rev.nuevoSaldoPendiente,
        cuotaCapital: pago.cuotaCapital,
        cuotaGanancia: pago.cuotaGanancia,
        acreditaCajaRuta: pago.acreditaCajaRuta,
        empleadoId: empleadoCobrador,
        nuevaCajaEmpleado: rev.nuevaCajaEmpleado,
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

    if (result.reabrePrestamo && result.adminId) {
      void db
        .collection(EMPRESAS_COLLECTION)
        .doc(empresaId)
        .collection(USUARIOS_SUBCOLLECTION)
        .doc(result.adminId)
        .set({ totalPrestamosActivos: FieldValue.increment(1) }, { merge: true });
    }

    try {
      if (result.cuotaCapital > 0) {
        await recordDebitMovement({
          db,
          empresaId,
          walletType: result.acreditaCajaRuta ? "ruta_caja" : "empleado_caja",
          walletId: result.acreditaCajaRuta
            ? (result.rutaId ?? "")
            : (result.empleadoId ?? ""),
          amount: result.cuotaCapital,
          balanceAfter:
            !result.acreditaCajaRuta && result.nuevaCajaEmpleado !== null
              ? result.nuevaCajaEmpleado
              : undefined,
          eventType: "anulacion_pago_capital",
          scope: result.acreditaCajaRuta ? "ruta" : "empleado",
          createdBy: apiUser.uid,
          relatedEntityType: "pago",
          relatedEntityId: pagoId,
          metadata: { prestamoId, rutaId: result.rutaId, modo: result.modo },
          operationId: `anulacion_capital:${pagoId}`,
        });
      }
      if (result.cuotaGanancia > 0) {
        await recordDebitMovement({
          db,
          empresaId,
          walletType: result.acreditaCajaRuta ? "ruta_caja" : "empleado_caja",
          walletId: result.acreditaCajaRuta
            ? (result.rutaId ?? "")
            : (result.empleadoId ?? ""),
          amount: result.cuotaGanancia,
          balanceAfter:
            !result.acreditaCajaRuta && result.nuevaCajaEmpleado !== null
              ? result.nuevaCajaEmpleado
              : undefined,
          eventType: "anulacion_pago_ganancia",
          scope: result.acreditaCajaRuta ? "ruta" : "empleado",
          createdBy: apiUser.uid,
          relatedEntityType: "pago",
          relatedEntityId: pagoId,
          metadata: { prestamoId, rutaId: result.rutaId, modo: result.modo },
          operationId: `anulacion_ganancia:${pagoId}`,
        });
      }
    } catch (e) {
      console.warn("[ledger] No se pudo registrar movimiento de anulación", e);
    }

    return finalize(200, {
      ok: true,
      nuevoSaldoPendiente: result.nuevoSaldoPendiente,
      modo: result.modo,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";

    if (ELEGIBILIDAD_CODES.includes(msg as AnulacionElegibilidadError)) {
      return finalize(409, {
        error: mensajeElegibilidad(msg as AnulacionElegibilidadError),
      });
    }
    if (msg === "PAGO_NOT_FOUND") return finalize(404, { error: "Pago no encontrado." });
    if (msg === "PRESTAMO_NOT_FOUND")
      return finalize(404, { error: "Préstamo no encontrado." });
    if (msg === "RUTA_NOT_FOUND")
      return finalize(400, { error: "Ruta del préstamo no encontrada." });

    console.error("[anular-pago] Error inesperado:", e);
    return finalize(500, { error: "Error interno al anular el pago." });
  }
}
