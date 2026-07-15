import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USERS_COLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { applyRegistrarPrestamoEnRutaEnTx } from "@/lib/ruta-financiera-admin";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import {
  crearPrestamoEmpleado,
  mapCrearPrestamoEmpleadoError,
} from "@/lib/crear-prestamo-empleado";
import { recordDebitMovement } from "@/lib/financial-ledger";
import {
  startIdempotentOperation,
  finishIdempotentOperation,
} from "@/lib/financial-idempotency";
import type { ModalidadPago } from "@/types/firestore";
import { evaluarAprobacionPrestamoEmpleado } from "@/lib/prestamo-aprobacion-empleado";
import { normalizeEstadoPrestamo } from "@/lib/prestamo-estado";
import { withRateLimit } from "@/lib/with-rate-limit";
import { financialWriteLimiterUser } from "@/lib/rate-limit";
import {
  effectiveFechaFinal,
  validateFechaFinalRequired,
} from "@/lib/prestamo-fecha-final";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";


/** GET: lista préstamos. Empleado: los de su ruta. Admin/Jefe: los suyos */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const col = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId).collection(PRESTAMOS_SUBCOLLECTION);
  const snap =
    apiUser.role === "empleado" && apiUser.rutaId
      ? await col.where("rutaId", "==", apiUser.rutaId).limit(200).get()
      : await col.where("adminId", "==", apiUser.uid).limit(200).get();

  const prestamos = snap.docs.map((d) => {
    const data = d.data();
    const fechaFinal = effectiveFechaFinal(data);
    return {
      id: d.id,
      clienteId: data.clienteId ?? "",
      rutaId: data.rutaId ?? "",
      adminId: data.adminId ?? "",
      empleadoId: data.empleadoId ?? "",
      monto: data.monto ?? 0,
      interes: data.interes ?? 0,
      modalidad: data.modalidad ?? "mensual",
      numeroCuotas: data.numeroCuotas ?? 0,
      totalAPagar: data.totalAPagar ?? 0,
      saldoPendiente: data.saldoPendiente ?? 0,
      estado: normalizeEstadoPrestamo(data.estado),
      moroso: data.moroso === true,
      fechaInicio: data.fechaInicio?.toDate?.()?.toISOString?.() ?? null,
      fechaFinal,
      fechaVencimiento: fechaFinal,
      creadoEn: data.creadoEn?.toDate?.()?.toISOString?.() ?? null,
      /** Adelanto aplicado a la(s) siguiente(s) cuota(s). Si > 0, la próxima sugerencia es valorCuota - (adelanto % valorCuota). */
      adelantoCuota: data.adelantoCuota ?? 0,
      /** Fecha del último pago (para semáforo "cuota del día pagada" en ruta del día). */
      ultimoPagoFecha: data.ultimoPagoFecha?.toDate?.()?.toISOString?.() ?? null,
      intentosFallidos: typeof data.intentosFallidos === "number" ? data.intentosFallidos : 0,
    };
  });

  return NextResponse.json({ prestamos });
}

/** POST: crea un préstamo */
async function postHandler(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const {
    clienteId,
    rutaId,
    empleadoId,
    monto,
    interes,
    modalidad,
    numeroCuotas,
    fechaInicio,
    fechaFinal,
    idempotencyKey,
  } = body as {
    clienteId?: string;
    rutaId?: string;
    empleadoId?: string;
    monto?: number;
    interes?: number;
    modalidad?: ModalidadPago;
    numeroCuotas?: number;
    fechaInicio?: string;
    fechaFinal?: string;
    idempotencyKey?: string;
  };

  if (!clienteId?.trim()) {
    return NextResponse.json({ error: "El cliente es obligatorio" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const idem = await startIdempotentOperation({
    db,
    empresaId: apiUser.empresaId,
    key: idempotencyKey,
    endpoint: "prestamos:create",
    uid: apiUser.uid,
  });
  if (idem.replay) {
    return NextResponse.json(idem.payload, { status: idem.status });
  }
  const finalize = async (status: number, payload: Record<string, unknown>) => {
    await finishIdempotentOperation({
      db,
      empresaId: apiUser.empresaId,
      key: idempotencyKey,
      result: { ok: status < 400, status, payload },
    });
    return NextResponse.json(payload, { status });
  };
  const clienteRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId.trim());
  const clienteSnap = await clienteRef.get();

  if (typeof monto !== "number" || monto <= 0) {
    return finalize(400, { error: "Monto debe ser un número positivo" });
  }
  if (typeof numeroCuotas !== "number" || numeroCuotas < 1) {
    return finalize(400, { error: "Número de cuotas debe ser al menos 1" });
  }

  const fechaInicioYmd =
    typeof fechaInicio === "string" && fechaInicio.trim()
      ? fechaInicio.trim().slice(0, 10)
      : fechaDiaColombiaHoy();
  const fechaFinalVal = validateFechaFinalRequired(fechaFinal, fechaInicioYmd);
  if (!fechaFinalVal.ok) {
    return finalize(400, { error: fechaFinalVal.error });
  }
  const fechaFinalYmd = fechaFinalVal.ymd;

  if (apiUser.role === "empleado") {
    const modEmp: ModalidadPago =
      modalidad === "diario" || modalidad === "semanal" ? modalidad : "mensual";
    const interesPctEmp = typeof interes === "number" ? interes : 0;

    const evaluacion = await evaluarAprobacionPrestamoEmpleado(
      db,
      apiUser.empresaId,
      clienteId.trim(),
      monto
    );
    if (evaluacion.requiereAprobacionAdmin) {
      const detalle =
        evaluacion.motivo === "cliente_sin_historial"
          ? "Este cliente no tiene historial de préstamos"
          : evaluacion.montoUltimoPrestamo !== null
            ? `El monto supera el último préstamo ($${evaluacion.montoUltimoPrestamo.toLocaleString("es-CO")})`
            : "El monto requiere aprobación del administrador";
      return finalize(403, {
        error: `${detalle}. Debes enviar una solicitud para que el administrador la apruebe.`,
        requiereAprobacionAdmin: true,
        motivo: evaluacion.motivo,
        montoUltimoPrestamo: evaluacion.montoUltimoPrestamo,
      });
    }

    const rutaIdEmp =
      (rutaId ?? "").trim() ||
      (apiUser.rutaId?.trim() ?? "") ||
      (clienteSnap.exists
        ? ((clienteSnap.data()?.rutaId as string) ?? "").trim()
        : "");
    if (!rutaIdEmp) {
      return finalize(400, { error: "No tienes ruta asignada" });
    }

    const rutaSnapEmp = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(apiUser.empresaId)
      .collection(RUTAS_SUBCOLLECTION)
      .doc(rutaIdEmp)
      .get();
    if (!rutaSnapEmp.exists) {
      return finalize(400, { error: "Ruta no encontrada" });
    }
    const adminIdEmp =
      typeof rutaSnapEmp.data()?.adminId === "string"
        ? rutaSnapEmp.data()!.adminId.trim()
        : "";
    if (!adminIdEmp) {
      return finalize(400, { error: "La ruta no tiene administrador" });
    }

    const clienteNombreEmp =
      typeof clienteSnap.data()?.nombre === "string"
        ? (clienteSnap.data()!.nombre as string).trim()
        : "";

    try {
      const result = await crearPrestamoEmpleado(db, {
        empresaId: apiUser.empresaId,
        empleadoUid: apiUser.uid,
        adminId: adminIdEmp,
        rutaId: rutaIdEmp,
        clienteId: clienteId.trim(),
        clienteNombre: clienteNombreEmp,
        monto,
        interes: interesPctEmp,
        modalidad: modEmp,
        numeroCuotas,
        fechaInicio: fechaInicioYmd,
        fechaFinal: fechaFinalYmd,
        aprobacionTipo: "automatica",
        aprobadoPorAdmin: null,
        montoUltimoPrestamoReferencia: evaluacion.montoUltimoPrestamo,
      });

      void (async () => {
        try {
          const userSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
          const empleadoNombre =
            (typeof userSnap.data()?.displayName === "string" &&
              userSnap.data()!.displayName.trim()) ||
            (typeof userSnap.data()?.email === "string" &&
              userSnap.data()!.email.trim()) ||
            apiUser.uid;
          const { getAdminMessaging } = await import("@/lib/firebase-admin");
          const { notifyAdminPrestamoEmpleado } = await import("@/lib/fcm-notify-admin");
          await notifyAdminPrestamoEmpleado(getAdminMessaging(), {
            adminUid: adminIdEmp,
            empresaId: apiUser.empresaId,
            empleadoNombre,
            clienteNombre: clienteNombreEmp || "Cliente",
            monto,
            prestamoId: result.prestamoId,
          });
        } catch (e) {
          console.warn("[fcm] notify admin prestamo:", e);
        }
      })();

      return finalize(200, { id: result.prestamoId });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Error al crear préstamo";
      const msg = mapCrearPrestamoEmpleadoError(raw);
      const status =
        raw === "CLIENTE_NOT_FOUND"
          ? 404
          : msg.includes("moroso") ||
              msg.includes("préstamo activo") ||
              msg.includes("ruta") ||
              msg.includes("Cliente") ||
              msg.includes("saldo") ||
              msg.includes("caja") ||
              msg.includes("Capital") ||
              msg.includes("descuadrado") ||
              msg.includes("Trabajador")
            ? 400
            : 500;
      return finalize(status, { error: msg });
    }
  }

  const mod: ModalidadPago = modalidad === "diario" || modalidad === "semanal" ? modalidad : "mensual";
  const interesPct = typeof interes === "number" ? interes : 0;
  const totalAPagar = monto * (1 + interesPct / 100);
  const inicio = new Date(fechaInicioYmd);
  inicio.setHours(0, 0, 0, 0);

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc();

  const adminIdPrestamo = apiUser.uid;
  const empleadoIdPrestamo = (empleadoId ?? apiUser.uid).toString().trim();
  let rutaIdPrestamo = (rutaId ?? "").trim();
  if (!rutaIdPrestamo && clienteSnap.exists) {
    rutaIdPrestamo = (clienteSnap.data()?.rutaId as string) ?? "";
  }

  let ledgerWalletType: "ruta_caja" | "empleado_caja" | null = null;
  let ledgerWalletId = "";
  let ledgerBalanceAfter: number | undefined;
  let ledgerEventType = "";

  const rutaRefPrestamo = rutaIdPrestamo
    ? db
        .collection(EMPRESAS_COLLECTION)
        .doc(apiUser.empresaId)
        .collection(RUTAS_SUBCOLLECTION)
        .doc(rutaIdPrestamo)
    : null;

  const clienteNombre =
    typeof clienteSnap.data()?.nombre === "string"
      ? (clienteSnap.data()!.nombre as string).trim()
      : "";

  try {
    await db.runTransaction(async (tx) => {
      // ── Todas las lecturas primero (requisito de Firestore) ──
      const clienteSnapTx = await tx.get(clienteRef);
      if (!clienteSnapTx.exists) throw new Error("CLIENTE_NOT_FOUND");

      let rutaSnapTx: DocumentSnapshot | null = null;
      if (rutaRefPrestamo) {
        rutaSnapTx = await tx.get(rutaRefPrestamo);
      }

      // ── Validaciones ──
      const clienteData = clienteSnapTx.data() as Record<string, unknown>;
      if (clienteData.moroso === true) throw new Error("CLIENTE_MOROSO");
      if (clienteData.prestamo_activo === true) throw new Error("CLIENTE_CON_PRESTAMO_ACTIVO");

      const now = new Date();

      // ── Desembolso desde caja ruta (dentro de la tx: atómico con la creación del préstamo) ──
      if (rutaRefPrestamo && rutaSnapTx) {
        applyRegistrarPrestamoEnRutaEnTx(tx, {
          rutaSnap: rutaSnapTx,
          rutaRef: rutaRefPrestamo,
          monto,
          now,
        });
        ledgerWalletType = "ruta_caja";
        ledgerWalletId = rutaIdPrestamo;
        ledgerEventType = "prestamo_desembolso_ruta";
      }

      // ── Escrituras ──
      tx.set(ref, {
        clienteId: clienteId.trim(),
        clienteNombre,
        rutaId: rutaIdPrestamo,
        adminId: adminIdPrestamo,
        empleadoId: empleadoIdPrestamo,
        monto,
        interes: interesPct,
        modalidad: mod,
        numeroCuotas,
        totalAPagar,
        saldoPendiente: totalAPagar,
        estado: "activo",
        moroso: clienteData.moroso === true,
        fechaInicio: inicio,
        fechaFinal: fechaFinalYmd,
        adelantoCuota: 0,
        creadoEn: FieldValue.serverTimestamp(),
        ...(rutaIdPrestamo ? { desembolsoDesde: "caja_ruta" as const } : {}),
      });

      tx.set(
        db
          .collection(EMPRESAS_COLLECTION)
          .doc(apiUser.empresaId)
          .collection(USUARIOS_SUBCOLLECTION)
          .doc(adminIdPrestamo),
        { totalPrestamosActivos: FieldValue.increment(1) },
        { merge: true }
      );

      tx.update(clienteRef, { prestamo_activo: true });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "CLIENTE_NOT_FOUND") {
      return finalize(404, { error: "Cliente no encontrado" });
    }
    if (msg === "CLIENTE_MOROSO") {
      return finalize(400, { error: "No se puede otorgar préstamo a un cliente moroso" });
    }
    if (msg === "CLIENTE_CON_PRESTAMO_ACTIVO") {
      return finalize(400, { error: "El cliente ya tiene un préstamo activo" });
    }
    if (msg === "Saldo insuficiente en base de la ruta" || msg === "Ruta no encontrada" || msg.includes("descuadrado")) {
      return finalize(400, { error: msg });
    }
    throw e;
  }

  // Snapshot de capital de ruta y saldo para ledger — después de la tx, no dentro
  if (rutaRefPrestamo && rutaIdPrestamo) {
    try {
      const rutaAfter = await rutaRefPrestamo.get();
      if (rutaAfter.exists) {
        await upsertCapitalRutaSnapshot(
          db,
          apiUser.empresaId,
          rutaIdPrestamo,
          rutaAfter.data()!
        );
        const cajaRuta = rutaAfter.data()?.cajaRuta;
        if (typeof cajaRuta === "number") {
          ledgerBalanceAfter = cajaRuta;
        }
      }
    } catch (e) {
      console.warn("[prestamos] upsertCapitalRutaSnapshot post-tx:", e);
    }
  }

  if (rutaIdPrestamo && ledgerWalletType && ledgerWalletId) {
    try {
      await recordDebitMovement({
        db,
        empresaId: apiUser.empresaId,
        walletType: ledgerWalletType,
        walletId: ledgerWalletId,
        amount: monto,
        balanceAfter: ledgerBalanceAfter,
        eventType: ledgerEventType,
        scope: ledgerWalletType === "ruta_caja" ? "ruta" : "empleado",
        createdBy: apiUser.uid,
        relatedEntityType: "prestamo",
        relatedEntityId: ref.id,
        metadata: {
          prestamoId: ref.id,
          clienteId: clienteId.trim(),
          rutaId: rutaIdPrestamo,
          empleadoId: empleadoIdPrestamo,
          totalAPagar,
          interesPct,
        },
        operationId: `prestamo:${ref.id}`,
      });
    } catch (e) {
      console.warn("[ledger] No se pudo registrar movimiento de desembolso", e);
    }
  }

  return finalize(200, { id: ref.id });
}

export const POST = withRateLimit(financialWriteLimiterUser, postHandler);
