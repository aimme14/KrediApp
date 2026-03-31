/**
 * Servicio de capital de empresa (nivel jefe).
 * capitalEmpresa = cajaEmpresa + suma(capitalAdmin) − gastosEmpresa
 * Persistencia: empresas/{jefeUid}/capital/cajaEmpresa (sin documento "actual").
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_CAJA_EMPRESA_DOC,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalEmpresa } from "@/lib/capital-formulas";
import {
  computeSumaCapitalAdminsDetalle,
  persistAggregatedCapitalDocs,
} from "@/lib/capital-aggregates";
import { sumGastosEmpresaCollection } from "@/lib/gastos-totals";

export interface CapitalEmpresaDoc {
  /** Resultado de la fórmula de empresa */
  capitalEmpresa: number;
  cajaEmpresa: number;
  gastosEmpresa: number;
  /** Suma de capitalAdmin de todos los administradores */
  sumaCapitalAdmins: number;
  jefeUid: string;
  updatedAt: Date;
  historial?: Array<{ montoAnterior: number; montoNuevo: number; at: Date }>;
}

const MAX_HISTORIAL = 6;

function cajaEmpresaRef(db: Firestore, jefeUid: string) {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_CAJA_EMPRESA_DOC);
}

async function buildCapitalEmpresaDoc(
  db: Firestore,
  jefeUid: string,
  snapData: Record<string, unknown> | undefined,
  updatedAt: Date
): Promise<Omit<CapitalEmpresaDoc, "historial">> {
  const cajaEmpresa =
    snapData && typeof snapData.cajaEmpresa === "number"
      ? snapData.cajaEmpresa
      : 0;
  const gastosEmpresa = await sumGastosEmpresaCollection(db, jefeUid);

  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    jefeUid
  );
  const capitalEmpresa = computeCapitalEmpresa(cajaEmpresa, sumaCapitalAdmins);

  return {
    capitalEmpresa,
    cajaEmpresa,
    gastosEmpresa,
    sumaCapitalAdmins,
    jefeUid,
    updatedAt,
  };
}

/**
 * Lee capital de empresa: documento cajaEmpresa + agregados de administradores.
 */
export async function getCapitalEmpresa(
  db: Firestore,
  jefeUid: string
): Promise<CapitalEmpresaDoc> {
  const ref = cajaEmpresaRef(db, jefeUid);
  const snap = await ref.get();

  if (!snap.exists) {
    return {
      capitalEmpresa: 0,
      cajaEmpresa: 0,
      gastosEmpresa: 0,
      sumaCapitalAdmins: 0,
      jefeUid,
      updatedAt: new Date(0),
    };
  }

  const data = snap.data()!;
  const updatedAt =
    (data.updatedAt as { toDate?: () => Date })?.toDate?.() ?? new Date(0);

  const base = await buildCapitalEmpresaDoc(db, jefeUid, data, updatedAt);

  const historial = Array.isArray(data.historial)
    ? (data.historial as Array<{ at?: { toDate?: () => Date } }>).map(
        (h: Record<string, unknown>) => ({
          montoAnterior: (h.montoAnterior as number) ?? 0,
          montoNuevo: (h.montoNuevo as number) ?? 0,
          at: (h.at as { toDate?: () => Date })?.toDate?.() ?? new Date(0),
        })
      )
    : undefined;

  return { ...base, historial };
}

/**
 * Establece el capital de empresa objetivo (monto = capitalEmpresa deseado).
 * Ajusta cajaEmpresa = monto − sumaCapitalAdmins (los gastos de empresa ya afectan la caja al registrarse).
 */
export async function setCapitalInicial(
  db: Firestore,
  jefeUid: string,
  monto: number
): Promise<CapitalEmpresaDoc> {
  if (monto < 0) throw new Error("El monto inicial no puede ser negativo");

  const antes = await getCapitalEmpresa(db, jefeUid);
  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    jefeUid
  );
  const ref = cajaEmpresaRef(db, jefeUid);
  const snap = await ref.get();
  const prev = snap.data();

  const cajaEmpresa = monto - sumaCapitalAdmins;
  if (cajaEmpresa < 0) {
    throw new Error(
      "El capital total no puede ser menor a la suma de capitales de administradores"
    );
  }

  const now = new Date();
  const historialActual = Array.isArray(prev?.historial) ? prev!.historial : [];
  const capitalEmpresa = computeCapitalEmpresa(cajaEmpresa, sumaCapitalAdmins);
  const nuevaEntrada = {
    montoAnterior: antes.capitalEmpresa,
    montoNuevo: capitalEmpresa,
    at: now,
  };
  const historial = [nuevaEntrada, ...(historialActual as object[])].slice(
    0,
    MAX_HISTORIAL
  );

  await ref.set(
    {
      cajaEmpresa,
      capitalEmpresa,
      jefeUid,
      updatedAt: now,
      historial,
    },
    { merge: true }
  );

  await persistAggregatedCapitalDocs(db, jefeUid);
  return getCapitalEmpresa(db, jefeUid);
}

/**
 * Ajuste a la caja empresa (delta suma o resta). No puede dejar cajaEmpresa negativa.
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
      "Saldo insuficiente en caja empresa. No se puede restar más de lo disponible."
    );
  }

  const ref = cajaEmpresaRef(db, jefeUid);
  const now = new Date();
  const cajaEmpresa = newCaja;
  const capitalEmpresa = computeCapitalEmpresa(
    cajaEmpresa,
    current.sumaCapitalAdmins
  );
  const historialActual = current.historial ?? [];
  const nuevaEntrada = {
    montoAnterior: current.capitalEmpresa,
    montoNuevo: capitalEmpresa,
    at: now,
  };
  const historial = [nuevaEntrada, ...historialActual].slice(0, MAX_HISTORIAL);

  await ref.set(
    {
      cajaEmpresa,
      capitalEmpresa,
      jefeUid,
      updatedAt: now,
      historial,
    },
    { merge: true }
  );

  await persistAggregatedCapitalDocs(db, jefeUid);
  return getCapitalEmpresa(db, jefeUid);
}

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
 * Descuenta la caja empresa al asignar efectivo a un nuevo admin.
 * Debe llamarse antes de persistir el usuario admin; luego ejecutar
 * `persistAggregatedCapitalDocs` cuando el admin ya exista en Firestore.
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

  const ref = cajaEmpresaRef(db, jefeUid);
  const now = new Date();
  const cajaEmpresa = current.cajaEmpresa - monto;

  await ref.set(
    {
      cajaEmpresa,
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * Transfiere liquidez de caja empresa a la caja del administrador (incrementa cajaAdmin).
 * El capital total de empresa no cambia (solo se redistribuye entre caja empresa y Σ admins).
 */
export async function invertirCajaEmpresaEnAdministrador(
  db: Firestore,
  jefeUid: string,
  adminUid: string,
  monto: number
): Promise<CapitalEmpresaDoc> {
  if (!adminUid.trim()) throw new Error("Administrador no válido");
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0");

  const empresaRef = cajaEmpresaRef(db, jefeUid);
  const adminRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid);

  const now = new Date();

  await db.runTransaction(async (tx) => {
    const [empSnap, adminSnap] = await Promise.all([
      tx.get(empresaRef),
      tx.get(adminRef),
    ]);

    if (!adminSnap.exists) {
      throw new Error("Administrador no encontrado en la empresa");
    }
    const adm = adminSnap.data()!;
    if (adm.rol !== "admin") {
      throw new Error("El usuario seleccionado no es un administrador");
    }

    const empData = empSnap.exists ? empSnap.data() : undefined;
    const cajaEmpresaRaw =
      typeof empData?.cajaEmpresa === "number" ? empData.cajaEmpresa : 0;
    if (cajaEmpresaRaw < monto) {
      throw new Error("Saldo insuficiente en caja empresa");
    }

    const cajaAdmin =
      typeof adm.cajaAdmin === "number" ? adm.cajaAdmin : 0;
    const newCajaEmpresa = Math.round((cajaEmpresaRaw - monto) * 100) / 100;
    const newCajaAdmin = Math.round((cajaAdmin + monto) * 100) / 100;

    tx.set(
      empresaRef,
      {
        cajaEmpresa: newCajaEmpresa,
        updatedAt: now,
        jefeUid,
      },
      { merge: true }
    );
    tx.update(adminRef, {
      cajaAdmin: newCajaAdmin,
      ultimaActualizacionCapital: now,
    });
  });

  await persistAggregatedCapitalDocs(db, jefeUid);
  return getCapitalEmpresa(db, jefeUid);
}

/**
 * Descuenta un gasto operativo de la caja empresa (tras validar saldo).
 */
export async function descontarCajaEmpresa(
  db: Firestore,
  jefeUid: string,
  monto: number,
  _motivo?: string
): Promise<number> {
  if (monto <= 0) throw new Error("El monto del gasto debe ser mayor a 0");
  const current = await getCapitalEmpresa(db, jefeUid);
  if (current.cajaEmpresa < monto) {
    throw new Error("Saldo insuficiente en caja empresa para este gasto");
  }
  const ref = cajaEmpresaRef(db, jefeUid);
  const nuevaCaja = current.cajaEmpresa - monto;
  const now = new Date();
  await ref.set(
    {
      cajaEmpresa: nuevaCaja,
      updatedAt: now,
    },
    { merge: true }
  );
  return nuevaCaja;
}
