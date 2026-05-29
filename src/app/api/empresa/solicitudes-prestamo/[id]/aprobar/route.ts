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
import { recordDebitMovement } from "@/lib/financial-ledger";
import {
  getNextWorkingDay,
  addWorkingDays,
  FESTIVOS,
} from "@/lib/fechas-laborables";
import type { ModalidadPago } from "@/types/firestore";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administrador" }, { status: 403 });
  }

  const { id: solicitudId } = await params;
  if (!solicitudId?.trim()) {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }

  const db = getAdminFirestore();

  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .doc(solicitudId.trim());

  const solSnap = await solRef.get();
  if (!solSnap.exists) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }
  const sol = solSnap.data() as Record<string, unknown>;
  if (sol.estado !== "pendiente") {
    return NextResponse.json({ error: "La solicitud ya fue resuelta" }, { status: 400 });
  }
  if (sol.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes aprobar solicitudes de otra administración" }, { status: 403 });
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
    typeof sol.fechaInicio === "string"
      ? sol.fechaInicio
      : new Date().toISOString().slice(0, 10);
  const totalAPagar = Math.round(monto * (1 + interes / 100) * 100) / 100;

  const inicio = new Date(fechaInicio);
  inicio.setHours(0, 0, 0, 0);
  let fechaVencimiento: Date;
  if (modalidad === "diario") {
    const primerDiaCobro = getNextWorkingDay(inicio, FESTIVOS);
    fechaVencimiento = addWorkingDays(primerDiaCobro, numeroCuotas - 1, FESTIVOS);
  } else if (modalidad === "semanal") {
    const primerDiaCobro = getNextWorkingDay(inicio, FESTIVOS);
    const ultimaCuotaCalendar = addDays(primerDiaCobro, (numeroCuotas - 1) * 7);
    fechaVencimiento = getNextWorkingDay(ultimaCuotaCalendar, FESTIVOS);
  } else {
    const ultimaCuotaCalendar = addMonths(inicio, numeroCuotas - 1);
    fechaVencimiento = getNextWorkingDay(ultimaCuotaCalendar, FESTIVOS);
  }

  let ledgerBalanceAfter: number | undefined;

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

  try {
    await db.runTransaction(async (tx) => {
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

      ledgerBalanceAfter = nuevaCajaEmp;

      tx.update(empleadoRef, {
        cajaEmpleado: nuevaCajaEmp,
        ultimaActualizacionCapital: new Date(),
      });
      tx.update(rutaRef, {
        cajasEmpleados: nuevoCajasEmpleados,
        inversiones: nuevaInversiones,
        capitalTotal: Math.round((cajaRuta + nuevoCajasEmpleados + nuevaInversiones) * 100) / 100,
        ultimaActualizacion: new Date(),
      });

      tx.set(prestamoRef, {
        clienteId,
        clienteNombre,
        rutaId,
        adminId: apiUser.uid,
        empleadoId: empleadoUid,
        monto,
        interes,
        modalidad,
        numeroCuotas,
        totalAPagar,
        saldoPendiente: totalAPagar,
        estado: "activo",
        fechaInicio: inicio,
        fechaVencimiento,
        multaMora: 0,
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "CLIENTE_NOT_FOUND") {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    if (msg === "CLIENTE_MOROSO") {
      return NextResponse.json(
        { error: "No se puede otorgar préstamo a un cliente moroso" },
        { status: 400 }
      );
    }
    if (msg === "CLIENTE_CON_PRESTAMO_ACTIVO") {
      return NextResponse.json(
        {
          error:
            "El cliente ya tiene un préstamo activo — la solicitud fue rechazada automáticamente",
        },
        { status: 400 }
      );
    }
    if (msg === "EMPLEADO_NOT_FOUND") {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 400 });
    }
    if (msg === "RUTA_NOT_FOUND") {
      return NextResponse.json({ error: "Ruta no encontrada" }, { status: 400 });
    }
    if (msg === "SALDO_INSUFICIENTE_EMPLEADO") {
      return NextResponse.json(
        {
          error: "El empleado no tiene saldo suficiente en su caja para este préstamo",
        },
        { status: 400 }
      );
    }
    throw e;
  }

  try {
    await recordDebitMovement({
      db,
      empresaId: apiUser.empresaId,
      walletType: "empleado_caja",
      walletId: empleadoUid,
      amount: monto,
      balanceAfter: ledgerBalanceAfter,
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
    });
  } catch (e) {
    console.warn("[ledger] No se pudo registrar movimiento de desembolso", e);
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

  return NextResponse.json({ ok: true, prestamoId: prestamoRef.id });
}
