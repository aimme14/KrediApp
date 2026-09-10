/**
 * Servicio de capital/caja del administrador.
 * cajaAdmin se guarda en empresas/{empresaId}/usuarios/{adminUid}.cajaAdmin
 *
 * Las variantes `…EnTx` se componen dentro de la transacción del caller (con el
 * snapshot ya leído vía tx.get), para que el débito de caja y el documento que
 * lo justifica se confirmen o se descarten juntos.
 */

import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION } from "@/lib/empresas-db";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Referencia al documento de usuario donde vive `cajaAdmin`. */
export function cajaAdminRef(
  db: Firestore,
  empresaId: string,
  adminUid: string
): DocumentReference {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid);
}

export async function getCajaAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<number> {
  const snap = await cajaAdminRef(db, empresaId, adminUid).get();
  if (!snap.exists) return 0;
  const data = snap.data()!;
  return typeof data.cajaAdmin === "number" ? data.cajaAdmin : 0;
}

/**
 * Descuenta monto de la caja del admin dentro de una transacción existente.
 * `adminSnap` debe venir de tx.get(adminRef) para que el saldo quede bloqueado.
 *
 * @throws "Saldo insuficiente en base del administrador"
 */
export function applyDescontarCajaAdminEnTx(
  tx: Transaction,
  ctx: {
    adminRef: DocumentReference;
    adminSnap: DocumentSnapshot;
    monto: number;
    now: Date;
    acumularGastoPeriodo?: boolean;
  }
): number {
  const { adminRef, adminSnap, monto, now, acumularGastoPeriodo } = ctx;
  if (monto <= 0) throw new Error("El monto a descontar debe ser mayor a 0");

  const data = adminSnap.exists ? adminSnap.data()! : {};
  const cajaActual = typeof data.cajaAdmin === "number" ? data.cajaAdmin : 0;
  const gastosAdminActual =
    typeof data.gastosAdmin === "number" ? data.gastosAdmin : 0;

  if (cajaActual < monto) {
    throw new Error("Saldo insuficiente en base del administrador");
  }

  const nuevaCaja = round2(cajaActual - monto);
  const payload: Record<string, unknown> = {
    cajaAdmin: nuevaCaja,
    ultimaActualizacionCapital: now,
  };
  if (acumularGastoPeriodo) {
    payload.gastosAdmin = round2(gastosAdminActual + monto);
  }

  tx.set(adminRef, payload, { merge: true });

  return nuevaCaja;
}

/** Suma monto a la caja del admin dentro de una transacción existente. */
export function applySumarCajaAdminEnTx(
  tx: Transaction,
  ctx: {
    adminRef: DocumentReference;
    adminSnap: DocumentSnapshot;
    monto: number;
    now: Date;
  }
): number {
  const { adminRef, adminSnap, monto, now } = ctx;
  if (monto <= 0) throw new Error("El monto a sumar debe ser mayor a 0");

  const data = adminSnap.exists ? adminSnap.data()! : {};
  const cajaActual = typeof data.cajaAdmin === "number" ? data.cajaAdmin : 0;
  const nuevaCaja = round2(cajaActual + monto);

  tx.set(
    adminRef,
    {
      cajaAdmin: nuevaCaja,
      ultimaActualizacionCapital: now,
    },
    { merge: true }
  );

  return nuevaCaja;
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

  const adminRef = cajaAdminRef(db, empresaId, adminUid);

  return db.runTransaction(async (tx) => {
    const adminSnap = await tx.get(adminRef);
    return applyDescontarCajaAdminEnTx(tx, {
      adminRef,
      adminSnap,
      monto,
      now: new Date(),
      acumularGastoPeriodo: options?.acumularGastoPeriodo,
    });
  });
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

  const adminRef = cajaAdminRef(db, empresaId, adminUid);

  return db.runTransaction(async (tx) => {
    const adminSnap = await tx.get(adminRef);
    return applySumarCajaAdminEnTx(tx, {
      adminRef,
      adminSnap,
      monto,
      now: new Date(),
    });
  });
}
