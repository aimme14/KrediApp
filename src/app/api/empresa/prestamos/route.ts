import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { registrarPrestamoEnRuta } from "@/lib/ruta-financiera-admin";
import {
  getNextWorkingDay,
  addWorkingDays,
  FESTIVOS,
} from "@/lib/fechas-laborables";
import type { ModalidadPago } from "@/types/firestore";

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
      ? await col.where("rutaId", "==", apiUser.rutaId).get()
      : await col.where("adminId", "==", apiUser.uid).get();

  const prestamos = snap.docs.map((d) => {
    const data = d.data();
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
      estado: data.estado ?? "activo",
      fechaInicio: data.fechaInicio?.toDate?.()?.toISOString?.() ?? null,
      fechaVencimiento: data.fechaVencimiento?.toDate?.()?.toISOString?.() ?? null,
      multaMora: data.multaMora ?? 0,
      /** Adelanto aplicado a la(s) siguiente(s) cuota(s). Si > 0, la próxima sugerencia es valorCuota - (adelanto % valorCuota). */
      adelantoCuota: data.adelantoCuota ?? 0,
      /** Fecha del último pago (para semáforo "cuota del día pagada" en ruta del día). */
      ultimoPagoFecha: data.ultimoPagoFecha?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  return NextResponse.json({ prestamos });
}

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

/** POST: crea un préstamo */
export async function POST(request: NextRequest) {
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
    multaMora,
  } = body as {
    clienteId?: string;
    rutaId?: string;
    empleadoId?: string;
    monto?: number;
    interes?: number;
    modalidad?: ModalidadPago;
    numeroCuotas?: number;
    fechaInicio?: string;
    multaMora?: number;
  };

  if (!clienteId?.trim()) {
    return NextResponse.json({ error: "El cliente es obligatorio" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const clienteRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId.trim());
  const clienteSnap = await clienteRef.get();
  if (clienteSnap.exists && clienteSnap.data()?.moroso === true) {
    return NextResponse.json(
      { error: "No se puede otorgar préstamo a un cliente moroso (excluido)" },
      { status: 400 }
    );
  }

  if (typeof monto !== "number" || monto <= 0) {
    return NextResponse.json({ error: "Monto debe ser un número positivo" }, { status: 400 });
  }
  if (typeof numeroCuotas !== "number" || numeroCuotas < 1) {
    return NextResponse.json({ error: "Número de cuotas debe ser al menos 1" }, { status: 400 });
  }

  const mod: ModalidadPago = modalidad === "diario" || modalidad === "semanal" ? modalidad : "mensual";
  const interesPct = typeof interes === "number" ? interes : 0;
  const totalAPagar = monto * (1 + interesPct / 100);
  const inicio = fechaInicio ? new Date(fechaInicio) : new Date();
  inicio.setHours(0, 0, 0, 0);

  // Fin previsto (referencia, no forzado): solo días laborables (lun-sáb, sin festivos)
  let fechaVencimiento: Date;
  if (mod === "diario") {
    const primerDiaCobro = getNextWorkingDay(inicio, FESTIVOS);
    fechaVencimiento = addWorkingDays(primerDiaCobro, numeroCuotas - 1, FESTIVOS);
  } else if (mod === "semanal") {
    const primerDiaCobro = getNextWorkingDay(inicio, FESTIVOS);
    const ultimaCuotaCalendar = addDays(primerDiaCobro, (numeroCuotas - 1) * 7);
    fechaVencimiento = getNextWorkingDay(ultimaCuotaCalendar, FESTIVOS);
  } else {
    const ultimaCuotaCalendar = addMonths(inicio, numeroCuotas - 1);
    fechaVencimiento = getNextWorkingDay(ultimaCuotaCalendar, FESTIVOS);
  }

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc();

  const adminIdPrestamo = apiUser.role === "empleado" && apiUser.adminId ? apiUser.adminId : apiUser.uid;
  const empleadoIdPrestamo = apiUser.role === "empleado" ? apiUser.uid : (empleadoId ?? apiUser.uid).toString().trim();
  let rutaIdPrestamo = (rutaId ?? "").trim() || (apiUser.role === "empleado" && apiUser.rutaId ? apiUser.rutaId : "");
  if (!rutaIdPrestamo && clienteSnap.exists) {
    rutaIdPrestamo = (clienteSnap.data()?.rutaId as string) ?? "";
  }

  await ref.set({
    clienteId: clienteId.trim(),
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
    fechaInicio: inicio,
    fechaVencimiento,
    multaMora: typeof multaMora === "number" ? multaMora : 0,
    adelantoCuota: 0,
  });

  if (rutaIdPrestamo) {
    try {
      await registrarPrestamoEnRuta(db, apiUser.empresaId, rutaIdPrestamo, monto);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al impactar caja de la ruta" },
        { status: 400 }
      );
    }
  }

  if (clienteSnap.exists) {
    await clienteRef.update({ prestamo_activo: true });
  }

  return NextResponse.json({ id: ref.id });
}
