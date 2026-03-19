/**
 * Servicio de capital de empresa (nivel jefe).
 * Invariante: capitalTotal = cajaEmpresa + capitalAsignadoAdmins
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_DOC_ID,
} from "@/lib/empresas-db";

export interface CapitalEmpresaDoc {
  capitalTotal: number;
  cajaEmpresa: number;
  capitalAsignadoAdmins: number;
  jefeUid: string;
  updatedAt: Date;
  historial?: Array<{ montoAnterior: number; montoNuevo: number; at: Date }>;
}

const MAX_HISTORIAL = 6;

function isNewFormat(data: Record<string, unknown>): boolean {
  return (
    typeof data.capitalTotal === "number" &&
    typeof data.cajaEmpresa === "number" &&
    typeof data.capitalAsignadoAdmins === "number"
  );
}

/**
 * Lee el documento de capital y lo normaliza al formato nuevo.
 * Si solo existe "monto" (formato antiguo), devuelve capitalTotal = cajaEmpresa = monto, capitalAsignadoAdmins = 0.
 */
export async function getCapitalEmpresa(
  db: Firestore,
  jefeUid: string
): Promise<CapitalEmpresaDoc> {
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_DOC_ID);

  const snap = await ref.get();
  if (!snap.exists) {
    return {
      capitalTotal: 0,
      cajaEmpresa: 0,
      capitalAsignadoAdmins: 0,
      jefeUid,
      updatedAt: new Date(0),
    };
  }

  const data = snap.data()!;
  if (isNewFormat(data)) {
    const updatedAt = (data.updatedAt as { toDate?: () => Date })?.toDate?.();
    return {
      capitalTotal: data.capitalTotal as number,
      cajaEmpresa: data.cajaEmpresa as number,
      capitalAsignadoAdmins: (data.capitalAsignadoAdmins as number) ?? 0,
      jefeUid: (data.jefeUid as string) ?? jefeUid,
      updatedAt: updatedAt ?? new Date(0),
      historial: Array.isArray(data.historial)
        ? (data.historial as Array<{ at?: { toDate?: () => Date } }>).map(
            (h: Record<string, unknown>) => ({
              montoAnterior: (h.montoAnterior as number) ?? 0,
              montoNuevo: (h.montoNuevo as number) ?? 0,
              at: (h.at as { toDate?: () => Date })?.toDate?.() ?? new Date(0),
            })
          )
        : undefined,
    };
  }

  // Migración: solo existe monto
  const monto = typeof data.monto === "number" ? data.monto : 0;
  const now = new Date();
  const migrated = {
    capitalTotal: monto,
    cajaEmpresa: monto,
    capitalAsignadoAdmins: 0,
    jefeUid,
    updatedAt: now,
    historial: Array.isArray(data.historial) ? data.historial.slice(0, MAX_HISTORIAL) : [],
  };
  await ref.set(
    {
      ...migrated,
      updatedAt: now,
      historial: migrated.historial,
    },
    { merge: true }
  );
  return {
    ...migrated,
    historial: Array.isArray(migrated.historial)
      ? (migrated.historial as Array<{ at?: { toDate?: () => Date } }>).map(
          (h: Record<string, unknown>) => ({
            montoAnterior: (h.montoAnterior as number) ?? 0,
            montoNuevo: (h.montoNuevo as number) ?? 0,
            at: (h.at as { toDate?: () => Date })?.toDate?.() ?? new Date(0),
          })
        )
      : undefined,
  };
}

/**
 * Establece capital inicial (primera vez). Solo válido si el doc no tiene formato nuevo o está en 0.
 */
export async function setCapitalInicial(
  db: Firestore,
  jefeUid: string,
  monto: number
): Promise<CapitalEmpresaDoc> {
  if (monto < 0) throw new Error("El monto inicial no puede ser negativo");
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_DOC_ID);

  const snap = await ref.get();
  const data = snap.data();
  if (snap.exists && data && isNewFormat(data)) {
    const asignado = (data.capitalAsignadoAdmins as number) ?? 0;
    if (asignado > 0 && monto < asignado) {
      throw new Error(
        "El capital total no puede ser menor al ya asignado a administradores"
      );
    }
  }

  const now = new Date();
  const capitalAsignadoAdmins =
    snap.exists && data && isNewFormat(data)
      ? ((data.capitalAsignadoAdmins as number) ?? 0)
      : 0;
  const cajaEmpresa = Math.max(0, monto - capitalAsignadoAdmins);
  const capitalTotal = monto;

  const historialActual = Array.isArray(data?.historial) ? data!.historial : [];
  const nuevaEntrada = {
    montoAnterior: snap.exists && typeof data?.monto === "number" ? data!.monto : 0,
    montoNuevo: capitalTotal,
    at: now,
  };
  const historial = [nuevaEntrada, ...(historialActual as object[])].slice(
    0,
    MAX_HISTORIAL
  );

  await ref.set(
    {
      capitalTotal,
      cajaEmpresa,
      capitalAsignadoAdmins,
      jefeUid,
      updatedAt: now,
      historial,
      monto: capitalTotal,
    },
    { merge: true }
  );

  return getCapitalEmpresa(db, jefeUid);
}

/**
 * Ajuste al capital: suma o resta. Al restar, solo se puede restar de cajaEmpresa (no de lo asignado a admins).
 */
export async function ajustarCapital(
  db: Firestore,
  jefeUid: string,
  delta: number
): Promise<CapitalEmpresaDoc> {
  const current = await getCapitalEmpresa(db, jefeUid);
  if (delta === 0) return current;

  const newCaja = current.cajaEmpresa + delta;
  if (newCaja < 0) {
    throw new Error(
      "Saldo insuficiente en caja empresa. No se puede restar más de lo disponible (sin tocar lo asignado a administradores)."
    );
  }

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_DOC_ID);

  const now = new Date();
  const capitalTotal = current.capitalTotal + delta;
  const cajaEmpresa = newCaja;
  const historialActual = current.historial ?? [];
  const nuevaEntrada = {
    montoAnterior: current.capitalTotal,
    montoNuevo: capitalTotal,
    at: now,
  };
  const historial = [nuevaEntrada, ...historialActual].slice(0, MAX_HISTORIAL);

  await ref.set(
    {
      capitalTotal,
      cajaEmpresa,
      capitalAsignadoAdmins: current.capitalAsignadoAdmins,
      jefeUid,
      updatedAt: now,
      historial,
      monto: capitalTotal,
    },
    { merge: true }
  );

  return getCapitalEmpresa(db, jefeUid);
}

/**
 * Salida de caja: retiro que reduce cajaEmpresa y capitalTotal. Solo permitido hasta el saldo en caja.
 */
export async function registrarSalida(
  db: Firestore,
  jefeUid: string,
  monto: number
): Promise<CapitalEmpresaDoc> {
  if (monto <= 0) throw new Error("El monto de salida debe ser mayor a 0");
  const current = await getCapitalEmpresa(db, jefeUid);
  if (current.cajaEmpresa < monto) {
    throw new Error(
      "Saldo insuficiente en caja empresa para esta salida"
    );
  }

  return ajustarCapital(db, jefeUid, -monto);
}

/**
 * Asignar capital a un admin (llamado al crear admin). Reduce cajaEmpresa y aumenta capitalAsignadoAdmins.
 */
export async function asignarCapitalAAdmin(
  db: Firestore,
  jefeUid: string,
  monto: number
): Promise<void> {
  if (monto <= 0) throw new Error("El monto a asignar debe ser mayor a 0");
  const current = await getCapitalEmpresa(db, jefeUid);
  if (current.cajaEmpresa < monto) {
    throw new Error("Saldo insuficiente en caja empresa para asignar al administrador");
  }

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_DOC_ID);

  const now = new Date();
  const cajaEmpresa = current.cajaEmpresa - monto;
  const capitalAsignadoAdmins = current.capitalAsignadoAdmins + monto;
  const capitalTotal = current.capitalTotal;

  await ref.set(
    {
      cajaEmpresa,
      capitalAsignadoAdmins,
      capitalTotal,
      updatedAt: now,
      monto: capitalTotal,
    },
    { merge: true }
  );
}
