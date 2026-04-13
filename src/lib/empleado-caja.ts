/**
 * Caja del empleado (trabajador) en empresas/{empresaId}/usuarios/{empleadoUid}.cajaEmpleado
 * Uso cuando no hay jornada activa; con jornada, el saldo operativo sigue jornada.cajaActual.
 */

import type { Firestore } from "firebase-admin/firestore";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION } from "@/lib/empresas-db";

export async function getCajaEmpleado(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<number> {
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const snap = await ref.get();
  if (!snap.exists) return 0;
  const data = snap.data()!;
  return typeof data.cajaEmpleado === "number" ? data.cajaEmpleado : 0;
}

/**
 * Descuenta monto de la caja del empleado. Lanza si no hay saldo suficiente.
 */
export async function descontarCajaEmpleado(
  db: Firestore,
  empresaId: string,
  empleadoUid: string,
  monto: number,
  _motivo?: string
): Promise<number> {
  if (monto <= 0) throw new Error("El monto a descontar debe ser mayor a 0");

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const snap = await ref.get();
  const cajaActual =
    snap.exists && typeof snap.data()?.cajaEmpleado === "number"
      ? snap.data()!.cajaEmpleado
      : 0;

  if (cajaActual < monto) {
    throw new Error("Saldo insuficiente en la base del empleado");
  }

  const nuevaCaja = cajaActual - monto;
  const now = new Date();
  await ref.set(
    {
      cajaEmpleado: nuevaCaja,
      ultimaActualizacionCapital: now,
    },
    { merge: true }
  );

  return nuevaCaja;
}
