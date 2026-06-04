/**
 * Servicio de capital/caja del administrador.
 * cajaAdmin se guarda en empresas/{empresaId}/usuarios/{adminUid}.cajaAdmin
 */

import type { Firestore } from "firebase-admin/firestore";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION } from "@/lib/empresas-db";

export async function getCajaAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<number> {
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid);

  const snap = await ref.get();
  if (!snap.exists) return 0;
  const data = snap.data()!;
  return typeof data.cajaAdmin === "number" ? data.cajaAdmin : 0;
}

/**
 * Descuenta monto de la caja del admin. Lanza si no hay saldo suficiente.
 */
export async function descontarCajaAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  monto: number,
  _motivo?: string,
  options?: { acumularGastoPeriodo?: boolean }
): Promise<number> {
  if (monto <= 0) throw new Error("El monto a descontar debe ser mayor a 0");

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid);

  const snap = await ref.get();
  const data = snap.exists ? snap.data()! : {};
  const cajaActual = typeof data.cajaAdmin === "number" ? data.cajaAdmin : 0;
  const gastosAdminActual =
    typeof data.gastosAdmin === "number" ? data.gastosAdmin : 0;

  if (cajaActual < monto) {
    throw new Error("Saldo insuficiente en base del administrador");
  }

  const nuevaCaja = Math.round((cajaActual - monto) * 100) / 100;
  const now = new Date();
  const payload: Record<string, unknown> = {
    cajaAdmin: nuevaCaja,
    ultimaActualizacionCapital: now,
  };
  if (options?.acumularGastoPeriodo) {
    payload.gastosAdmin = Math.round((gastosAdminActual + monto) * 100) / 100;
  }

  await ref.set(payload, { merge: true });

  return nuevaCaja;
}

/**
 * Suma monto a la caja del admin (ej. devolución o ajuste).
 */
export async function sumarCajaAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  monto: number
): Promise<number> {
  if (monto <= 0) throw new Error("El monto a sumar debe ser mayor a 0");

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid);

  const snap = await ref.get();
  const cajaActual = snap.exists && typeof snap.data()?.cajaAdmin === "number"
    ? snap.data()!.cajaAdmin
    : 0;

  const nuevaCaja = cajaActual + monto;
  const now = new Date();
  await ref.set(
    {
      cajaAdmin: nuevaCaja,
      ultimaActualizacionCapital: now,
    },
    { merge: true }
  );

  return nuevaCaja;
}
