import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { applyDesembolsoPrestamoDesdeCajaEmpleadoEnTx } from "@/lib/ruta-financiera-admin";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { recordDebitMovement } from "@/lib/financial-ledger";
import { validarClienteElegibleParaPrestamo } from "@/lib/prestamo-aprobacion-empleado";
import { resolveDiasCobroModoForCreate, validateFechaFinalRequired } from "@/lib/prestamo-fecha-final";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import type { ModalidadPago } from "@/types/firestore";

export type CrearPrestamoEmpleadoParams = {
  empresaId: string;
  empleadoUid: string;
  adminId: string;
  rutaId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  interes: number;
  modalidad: ModalidadPago;
  numeroCuotas: number;
  fechaInicio?: string;
  /** Fecha final informativa (YYYY-MM-DD), obligatoria. */
  fechaFinal: string;
  /** 5 = lun–vie · 6 = lun–sáb — default "6" si se omite. */
  diasCobroModo?: string;
  aprobacionTipo: "automatica" | "admin";
  aprobadoPorAdmin?: string | null;
  montoUltimoPrestamoReferencia?: number | null;
};

export type CrearPrestamoEmpleadoResult = {
  prestamoId: string;
  ledgerBalanceAfter?: number;
};

export async function crearPrestamoEmpleado(
  db: Firestore,
  params: CrearPrestamoEmpleadoParams
): Promise<CrearPrestamoEmpleadoResult> {
  const {
    empresaId,
    empleadoUid,
    adminId,
    rutaId,
    clienteId,
    clienteNombre,
    monto,
    interes,
    modalidad,
    numeroCuotas,
    fechaInicio,
    fechaFinal,
    diasCobroModo,
    aprobacionTipo,
    aprobadoPorAdmin,
    montoUltimoPrestamoReferencia,
  } = params;

  const mod: ModalidadPago =
    modalidad === "diario" || modalidad === "semanal" ? modalidad : "mensual";
  const interesPct = typeof interes === "number" ? interes : 0;
  const totalAPagar = monto * (1 + interesPct / 100);
  const fechaInicioYmd =
    typeof fechaInicio === "string" && fechaInicio.trim()
      ? fechaInicio.trim().slice(0, 10)
      : fechaDiaColombiaHoy();
  const fechaFinalVal = validateFechaFinalRequired(fechaFinal, fechaInicioYmd);
  if (!fechaFinalVal.ok) {
    throw new Error(fechaFinalVal.error);
  }
  const diasCobroVal = resolveDiasCobroModoForCreate(diasCobroModo);
  if (!diasCobroVal.ok) {
    throw new Error(diasCobroVal.error);
  }
  const inicio = new Date(fechaInicioYmd);
  inicio.setHours(0, 0, 0, 0);

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc();

  const clienteRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId.trim());

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const empleadoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const adminRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminId);

  let ledgerBalanceAfter: number | undefined;
  const now = new Date();

  await db.runTransaction(async (tx) => {
    const [rutaSnap, empleadoSnap, clienteSnapTx] = await Promise.all([
      tx.get(rutaRef),
      tx.get(empleadoRef),
      tx.get(clienteRef),
    ]);

    if (!clienteSnapTx.exists) {
      throw new Error("CLIENTE_NOT_FOUND");
    }
    validarClienteElegibleParaPrestamo(
      clienteSnapTx.data() as Record<string, unknown>
    );

    const { nuevaCajaEmp } = applyDesembolsoPrestamoDesdeCajaEmpleadoEnTx(tx, {
      rutaSnap,
      empleadoSnap,
      empleadoRef,
      rutaRef,
      monto,
      now,
    });

    ledgerBalanceAfter = nuevaCajaEmp;

    const clienteMoroso = clienteSnapTx.data()?.moroso === true;

    tx.set(prestamoRef, {
      clienteId: clienteId.trim(),
      clienteNombre,
      rutaId,
      adminId,
      empleadoId: empleadoUid,
      monto,
      interes: interesPct,
      modalidad: mod,
      numeroCuotas,
      totalAPagar,
      saldoPendiente: totalAPagar,
      estado: "activo",
      moroso: clienteMoroso,
      fechaInicio: inicio,
      fechaFinal: fechaFinalVal.ymd,
      diasCobroModo: diasCobroVal.modo,
      adelantoCuota: 0,
      intentosFallidos: 0,
      desembolsoDesde: "caja_empleado",
      aprobacionTipo,
      aprobadoPorAdmin: aprobadoPorAdmin ?? null,
      montoUltimoPrestamoReferencia:
        typeof montoUltimoPrestamoReferencia === "number"
          ? montoUltimoPrestamoReferencia
          : null,
      creadoEn: FieldValue.serverTimestamp(),
    });

    tx.set(adminRef, { totalPrestamosActivos: FieldValue.increment(1) }, { merge: true });
    tx.update(clienteRef, { prestamo_activo: true });
  });

  try {
    await recordDebitMovement({
      db,
      empresaId,
      walletType: "empleado_caja",
      walletId: empleadoUid,
      amount: monto,
      balanceAfter: ledgerBalanceAfter,
      eventType: "prestamo_desembolso_empleado",
      scope: "empleado",
      createdBy: empleadoUid,
      relatedEntityType: "prestamo",
      relatedEntityId: prestamoRef.id,
      metadata: {
        prestamoId: prestamoRef.id,
        clienteId: clienteId.trim(),
        rutaId,
        empleadoId: empleadoUid,
        totalAPagar,
        interesPct,
        aprobacionTipo,
      },
      operationId: `prestamo:${prestamoRef.id}`,
    });
  } catch (e) {
    console.warn("[ledger] No se pudo registrar movimiento de desembolso", e);
  }

  try {
    const rutaAfter = await rutaRef.get();
    if (rutaAfter.exists) {
      await upsertCapitalRutaSnapshot(db, empresaId, rutaId, rutaAfter.data()!);
    }
  } catch (e) {
    console.warn("[capital-snapshot] No se pudo actualizar snapshot", e);
  }

  return { prestamoId: prestamoRef.id, ledgerBalanceAfter };
}

export function mapCrearPrestamoEmpleadoError(msg: string): string {
  if (msg === "CLIENTE_NOT_FOUND") return "Cliente no encontrado";
  if (msg === "RUTA_NOT_FOUND") return "Ruta no encontrada";
  if (msg === "EMPLEADO_NOT_FOUND") return "Trabajador no encontrado";
  if (msg === "USUARIO_NO_ES_EMPLEADO") return "El usuario no es trabajador";
  if (msg === "SALDO_INSUFICIENTE_EMPLEADO") {
    return "Saldo insuficiente en la base del trabajador";
  }
  if (msg === "SALDO_INSUFICIENTE_RUTA") {
    return "Saldo insuficiente en bases de empleados de la ruta";
  }
  if (msg.includes("Capital descuadrado")) {
    return "Capital descuadrado — revisar operación";
  }
  if (msg === "CLIENTE_MOROSO" || msg.includes("moroso")) {
    return "No se puede otorgar préstamo a un cliente moroso";
  }
  if (msg === "CLIENTE_CON_PRESTAMO_ACTIVO" || msg.includes("préstamo activo")) {
    return "El cliente ya tiene un préstamo activo";
  }
  return msg;
}
