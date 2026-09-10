import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  SOLICITUDES_PRESTAMO_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { drainLedgerOutbox, enqueueLedgerOutboxInTx } from "@/lib/financial-ledger";
import { runIdempotent, type IdempotentOutcome } from "@/lib/financial-idempotency";
import type { ModalidadPago } from "@/types/firestore";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import { validateFechaFinalRequired, sugerirFechaFinalYmd, resolveDiasCobroModoForCreate, parseDiasCobroModo } from "@/lib/prestamo-fecha-final";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json({ error: "Solo administrador" }, { status: 403 });
  }

  const { id: solicitudIdRaw } = await params;
  if (!solicitudIdRaw?.trim()) {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }
  const solicitudId = solicitudIdRaw.trim();

  const db = getAdminFirestore();

  // Clave derivada del servidor: aprobar una solicitud es idempotente por
  // definición, sin depender de que el cliente mande una clave.
  const outcome = await runIdempotent({
    db,
    empresaId: apiUser.empresaId,
    key: `solicitud-prestamo-aprobar:${solicitudId}`,
    endpoint: "solicitudes-prestamo:aprobar",
    uid: apiUser.uid,
    handler: () => aprobar(db, apiUser, solicitudId),
  });

  return NextResponse.json(outcome.payload, { status: outcome.status });
}

type ApiUser = NonNullable<Awaited<ReturnType<typeof getApiUser>>>;

async function aprobar(
  db: ReturnType<typeof getAdminFirestore>,
  apiUser: ApiUser,
  solicitudId: string
): Promise<IdempotentOutcome> {
  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .doc(solicitudId);

  const solSnap = await solRef.get();
  if (!solSnap.exists) {
    return { status: 404, payload: { error: "Solicitud no encontrada" } };
  }
  const sol = solSnap.data() as Record<string, unknown>;
  if (sol.estado !== "pendiente") {
    return { status: 400, payload: { error: "La solicitud ya fue resuelta" } };
  }
  if (sol.adminId !== apiUser.uid) {
    return {
      status: 403,
      payload: { error: "No puedes aprobar solicitudes de otra administración" },
    };
  }

  const empleadoUid = typeof sol.empleadoUid === "string" ? sol.empleadoUid : "";
  const clienteId = typeof sol.clienteId === "string" ? sol.clienteId : "";
  const clienteNombre = typeof sol.clienteNombre === "string" ? sol.clienteNombre : "";
  const rutaId = typeof sol.rutaId === "string" ? sol.rutaId : "";
  const monto = typeof sol.monto === "number" ? sol.monto : 0;
  const interes = typeof sol.interes === "number" ? sol.interes : 0;
  const numeroCuotas = typeof sol.numeroCuotas === "number" ? sol.numeroCuotas : 1;
  const modalidad = (sol.modalidad as ModalidadPago) ?? "mensual";
  const fechaInicio =
    typeof sol.fechaInicio === "string" && sol.fechaInicio.trim()
      ? sol.fechaInicio.trim().slice(0, 10)
      : fechaDiaColombiaHoy();
  let fechaFinalVal = validateFechaFinalRequired(sol.fechaFinal, fechaInicio);
  const diasCobroResolved = resolveDiasCobroModoForCreate(sol.diasCobroModo);
  const diasCobroModo =
    diasCobroResolved.ok ? diasCobroResolved.modo : ("6" as const);
  if (!fechaFinalVal.ok) {
    // Solicitudes pendientes creadas antes de exigir fechaFinal: sugerir por cuotas.
    const sugerida = sugerirFechaFinalYmd(
      modalidad,
      fechaInicio,
      numeroCuotas,
      parseDiasCobroModo(diasCobroModo) ?? "6"
    );
    fechaFinalVal = validateFechaFinalRequired(sugerida, fechaInicio);
  }
  if (!fechaFinalVal.ok) {
    return {
      status: 400,
      payload: {
        error:
          "La solicitud no tiene fecha final válida. Pide al trabajador que vuelva a solicitar el préstamo.",
      },
    };
  }
  const fechaFinalYmd = fechaFinalVal.ymd;
  const totalAPagar = Math.round(monto * (1 + interes / 100) * 100) / 100;

  const inicio = new Date(fechaInicio);
  inicio.setHours(0, 0, 0, 0);

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc();

  const clienteRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId);

  const adminUsuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(apiUser.uid);

  const empleadoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  let ledgerOperationIds: string[] = [];

  try {
    await db.runTransaction(async (tx) => {
      // Primera lectura: la solicitud queda bloqueada por la transacción, de
      // modo que dos aprobaciones simultáneas no puedan desembolsar dos veces.
      const solSnapTx = await tx.get(solRef);
      if (!solSnapTx.exists) throw new Error("SOLICITUD_NOT_FOUND");
      const solTx = solSnapTx.data() as Record<string, unknown>;
      if (solTx.estado !== "pendiente") throw new Error("SOLICITUD_YA_RESUELTA");
      if (solTx.adminId !== apiUser.uid) throw new Error("SOLICITUD_DE_OTRO_ADMIN");

      const clienteSnapTx = await tx.get(clienteRef);
      if (!clienteSnapTx.exists) {
        throw new Error("CLIENTE_NOT_FOUND");
      }
      const clienteData = clienteSnapTx.data() as Record<string, unknown>;
      if (clienteData.moroso === true) {
        throw new Error("CLIENTE_MOROSO");
      }
      if (clienteData.prestamo_activo === true) {
        throw new Error("CLIENTE_CON_PRESTAMO_ACTIVO");
      }

      const [empleadoSnap, rutaSnap] = await Promise.all([
        tx.get(empleadoRef),
        tx.get(rutaRef),
      ]);

      if (!empleadoSnap.exists) throw new Error("EMPLEADO_NOT_FOUND");
      if (!rutaSnap.exists) throw new Error("RUTA_NOT_FOUND");

      const empData = empleadoSnap.data() as Record<string, unknown>;
      const rutaData = rutaSnap.data() as Record<string, unknown>;

      const cajaEmp = typeof empData.cajaEmpleado === "number" ? empData.cajaEmpleado : 0;
      if (cajaEmp < monto) throw new Error("SALDO_INSUFICIENTE_EMPLEADO");

      const cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
      const cajasEmpleados =
        typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
      const inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;

      const nuevaCajaEmp = Math.round((cajaEmp - monto) * 100) / 100;
      const nuevaInversiones = Math.round((inversiones + monto) * 100) / 100;
      const nuevoCajasEmpleados = Math.round((cajasEmpleados - monto) * 100) / 100;

      tx.update(empleadoRef, {
        cajaEmpleado: nuevaCajaEmp,
        ultimaActualizacionCapital: new Date(),
      });
      tx.update(rutaRef, {
        cajasEmpleados: nuevoCajasEmpleados,
        inversiones: nuevaInversiones,
        capitalTotal: Math.round((cajaRuta + nuevoCajasEmpleados + nuevaInversiones) * 100) / 100,
        totalPrestado: FieldValue.increment(monto),
        ultimaActualizacion: new Date(),
      });

      tx.set(prestamoRef, {
        clienteId,
        clienteNombre,
        rutaId,
        adminId: apiUser.uid,
        empleadoId: empleadoUid,
        solicitudId,
        monto,
        interes,
        modalidad,
        numeroCuotas,
        totalAPagar,
        saldoPendiente: totalAPagar,
        estado: "activo",
        moroso: clienteData.moroso === true,
        fechaInicio: inicio,
        fechaFinal: fechaFinalYmd,
        diasCobroModo,
        adelantoCuota: 0,
        intentosFallidos: 0,
        desembolsoDesde: "caja_empleado",
        creadoEn: FieldValue.serverTimestamp(),
      });

      tx.update(clienteRef, { prestamo_activo: true });

      tx.set(
        adminUsuarioRef,
        { totalPrestamosActivos: FieldValue.increment(1) },
        { merge: true }
      );

      tx.update(solRef, {
        estado: "aprobada",
        prestamoId: prestamoRef.id,
        resueltaEn: FieldValue.serverTimestamp(),
        resueltaPorUid: apiUser.uid,
      });

      // El movimiento del ledger se encola en la misma transacción: si el
      // desembolso se revierte, el asiento contable no queda huérfano.
      ledgerOperationIds = enqueueLedgerOutboxInTx(tx, db, apiUser.empresaId, [
        {
          direction: "debit",
          walletType: "empleado_caja",
          walletId: empleadoUid,
          amount: monto,
          balanceAfter: nuevaCajaEmp,
          eventType: "prestamo_desembolso_empleado",
          scope: "empleado",
          createdBy: apiUser.uid,
          relatedEntityType: "prestamo",
          relatedEntityId: prestamoRef.id,
          metadata: {
            prestamoId: prestamoRef.id,
            clienteId,
            rutaId,
            empleadoId: empleadoUid,
            totalAPagar,
            interesPct: interes,
            aprobadoPorAdmin: apiUser.uid,
          },
          operationId: `prestamo:${prestamoRef.id}`,
        },
      ]);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const conocido = mapAprobarError(msg);
    if (conocido) return conocido;
    throw e;
  }

  if (ledgerOperationIds.length > 0) {
    try {
      await drainLedgerOutbox(db, apiUser.empresaId, ledgerOperationIds);
    } catch (e) {
      console.warn("[ledger] No se pudo drenar el desembolso; queda pending en el outbox", e);
    }
  }

  void (async () => {
    try {
      const { getAdminMessaging } = await import("@/lib/firebase-admin");
      const { notifyEmpleadoSolicitudResuelta } = await import("@/lib/fcm-notify-empleado");
      await notifyEmpleadoSolicitudResuelta(getAdminMessaging(), {
        empleadoUid,
        empresaId: apiUser.empresaId,
        clienteNombre,
        monto,
        aprobada: true,
        motivoRechazo: null,
      });
    } catch (e) {
      console.warn("[fcm] notify empleado aprobacion:", e);
    }
  })();

  return { status: 200, payload: { ok: true, prestamoId: prestamoRef.id } };
}

/** Códigos de la transacción → respuesta HTTP. `null` = error inesperado. */
function mapAprobarError(msg: string): IdempotentOutcome | null {
  switch (msg) {
    case "SOLICITUD_NOT_FOUND":
      return { status: 404, payload: { error: "Solicitud no encontrada" } };
    case "SOLICITUD_YA_RESUELTA":
      return { status: 400, payload: { error: "La solicitud ya fue resuelta" } };
    case "SOLICITUD_DE_OTRO_ADMIN":
      return {
        status: 403,
        payload: { error: "No puedes aprobar solicitudes de otra administración" },
      };
    case "CLIENTE_NOT_FOUND":
      return { status: 404, payload: { error: "Cliente no encontrado" } };
    case "CLIENTE_MOROSO":
      return {
        status: 400,
        payload: { error: "No se puede otorgar préstamo a un cliente moroso" },
      };
    case "CLIENTE_CON_PRESTAMO_ACTIVO":
      return {
        status: 400,
        payload: {
          error:
            "El cliente ya tiene un préstamo activo — la solicitud fue rechazada automáticamente",
        },
      };
    case "EMPLEADO_NOT_FOUND":
      return { status: 400, payload: { error: "Empleado no encontrado" } };
    case "RUTA_NOT_FOUND":
      return { status: 400, payload: { error: "Ruta no encontrada" } };
    case "SALDO_INSUFICIENTE_EMPLEADO":
      return {
        status: 400,
        payload: {
          error: "El empleado no tiene saldo suficiente en su caja para este préstamo",
        },
      };
    default:
      return null;
  }
}
