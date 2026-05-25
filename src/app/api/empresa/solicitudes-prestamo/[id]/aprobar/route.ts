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
} from "@/lib/empresas-db";
import { registrarPrestamoDesdeCajaEmpleado } from "@/lib/ruta-financiera-admin";
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
  try {
    await registrarPrestamoDesdeCajaEmpleado(
      db,
      apiUser.empresaId,
      rutaId,
      empleadoUid,
      monto
    );
    const empSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(apiUser.empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(empleadoUid)
      .get();
    const cajaEmp = empSnap.data()?.cajaEmpleado;
    if (typeof cajaEmp === "number") ledgerBalanceAfter = cajaEmp;
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Error al desembolsar desde caja del empleado",
      },
      { status: 400 }
    );
  }

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc();

  await prestamoRef.set({
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

  await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId)
    .update({ prestamo_activo: true });

  await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(apiUser.uid)
    .set({ totalPrestamosActivos: FieldValue.increment(1) }, { merge: true });

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

  await solRef.update({
    estado: "aprobada",
    prestamoId: prestamoRef.id,
    resueltaEn: FieldValue.serverTimestamp(),
    resueltaPorUid: apiUser.uid,
  });

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
