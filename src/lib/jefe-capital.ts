/**
 * Servicio de capital de empresa (nivel jefe).
 * capitalEmpresa = cajaEmpresa + suma(capitalAdmin) − gastosEmpresa
 * Persistencia: empresas/{jefeUid}/capital/cajaEmpresa (sin documento "actual").
 */

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_CAJA_EMPRESA_DOC,
  CAPITAL_CAJA_EMPRESA_FLUJO_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalEmpresa } from "@/lib/capital-formulas";
import {
  computeSumaCapitalAdminsDetalle,
  persistAggregatedCapitalDocs,
} from "@/lib/capital-aggregates";
import { sumGastosEmpresaCollection } from "@/lib/gastos-totals";

/** Tipo de movimiento persistido en empresas/.../capital/cajaEmpresa/flujo/{id} */
export type CapitalEmpresaFlujoTipo =
  | "definicion_capital"
  | "ajuste_caja"
  | "inversion_admin"
  | "gasto_empresa"
  | "asignacion_nuevo_admin";

export interface CapitalEmpresaHistorialEntry {
  id?: string;
  montoAnterior: number;
  montoNuevo: number;
  at: Date;
  tipo?: CapitalEmpresaFlujoTipo;
}

export interface CapitalEmpresaDoc {
  /** Resultado de la fórmula de empresa */
  capitalEmpresa: number;
  cajaEmpresa: number;
  gastosEmpresa: number;
  /** Suma de capitalAdmin de todos los administradores */
  sumaCapitalAdmins: number;
  jefeUid: string;
  updatedAt: Date;
  /** Últimos movimientos desde la subcolección `flujo` (más reciente primero). */
  historial?: CapitalEmpresaHistorialEntry[];
}

/** Cuántas entradas de flujo se cargan al leer capital (API/UI). */
export const CAPITAL_EMPRESA_FLUJO_QUERY_LIMIT = 100;

function cajaEmpresaRef(db: Firestore, jefeUid: string) {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_CAJA_EMPRESA_DOC);
}

function capitalEmpresaFlujoCol(db: Firestore, jefeUid: string) {
  return cajaEmpresaRef(db, jefeUid).collection(
    CAPITAL_CAJA_EMPRESA_FLUJO_SUBCOLLECTION
  );
}

async function loadHistorialDesdeFlujo(
  db: Firestore,
  jefeUid: string
): Promise<CapitalEmpresaHistorialEntry[]> {
  try {
    const snap = await capitalEmpresaFlujoCol(db, jefeUid)
      .orderBy("at", "desc")
      .limit(CAPITAL_EMPRESA_FLUJO_QUERY_LIMIT)
      .get();
    return snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      const atRaw = x.at as { toDate?: () => Date } | undefined;
      const tipoRaw = x.tipo;
      return {
        id: d.id,
        montoAnterior: typeof x.montoAnterior === "number" ? x.montoAnterior : 0,
        montoNuevo: typeof x.montoNuevo === "number" ? x.montoNuevo : 0,
        at: atRaw?.toDate?.() ?? new Date(0),
        tipo:
          typeof tipoRaw === "string"
            ? (tipoRaw as CapitalEmpresaFlujoTipo)
            : undefined,
      };
    });
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "[capital empresa] No se pudo leer subcolección flujo (índice o permisos):",
        e
      );
    }
    return [];
  }
}

/**
 * Elimina todos los documentos de flujo bajo cajaEmpresa y quita el campo legado `historial` del documento principal.
 */
export async function clearCapitalEmpresaFlujo(
  db: Firestore,
  jefeUid: string
): Promise<void> {
  const col = capitalEmpresaFlujoCol(db, jefeUid);
  // Borrar en tandas (límite de operaciones por batch).
  let snap = await col.limit(450).get();
  while (!snap.empty) {
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
    snap = await col.limit(450).get();
  }
  await cajaEmpresaRef(db, jefeUid).set(
    { historial: FieldValue.delete() },
    { merge: true }
  );
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
      historial: [],
    };
  }

  const data = snap.data()!;
  const updatedAt =
    (data.updatedAt as { toDate?: () => Date })?.toDate?.() ?? new Date(0);

  const base = await buildCapitalEmpresaDoc(db, jefeUid, data, updatedAt);
  const desdeFlujo = await loadHistorialDesdeFlujo(db, jefeUid);
  /** Si aún no hay documentos en `flujo`, mostrar el array legado del documento (migración suave). */
  const historial =
    desdeFlujo.length > 0
      ? desdeFlujo
      : Array.isArray(data.historial)
        ? (
            data.historial as Array<Record<string, unknown>>
          ).map((h, index) => ({
            id: `legacy-${index}`,
            montoAnterior: (h.montoAnterior as number) ?? 0,
            montoNuevo: (h.montoNuevo as number) ?? 0,
            at:
              (h.at as { toDate?: () => Date })?.toDate?.() ?? new Date(0),
          }))
        : [];

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

  const cajaEmpresa = monto - sumaCapitalAdmins;
  if (cajaEmpresa < 0) {
    throw new Error(
      "El capital total no puede ser menor a la suma de capitales de administradores"
    );
  }

  const now = new Date();
  const capitalEmpresa = computeCapitalEmpresa(cajaEmpresa, sumaCapitalAdmins);

  const batch = db.batch();
  const flujoRef = capitalEmpresaFlujoCol(db, jefeUid).doc();
  batch.set(flujoRef, {
    tipo: "definicion_capital",
    montoAnterior: antes.capitalEmpresa,
    montoNuevo: capitalEmpresa,
    at: Timestamp.fromDate(now),
    jefeUid,
    cajaAnterior: antes.cajaEmpresa,
    cajaNueva: cajaEmpresa,
  });
  batch.set(
    ref,
    {
      cajaEmpresa,
      capitalEmpresa,
      jefeUid,
      updatedAt: now,
      historial: FieldValue.delete(),
    },
    { merge: true }
  );
  await batch.commit();

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
      "Saldo insuficiente en base empresa. No se puede restar más de lo disponible."
    );
  }

  const ref = cajaEmpresaRef(db, jefeUid);
  const now = new Date();
  const cajaEmpresa = newCaja;
  const capitalEmpresa = computeCapitalEmpresa(
    cajaEmpresa,
    current.sumaCapitalAdmins
  );
  const batch = db.batch();
  const flujoRef = capitalEmpresaFlujoCol(db, jefeUid).doc();
  batch.set(flujoRef, {
    tipo: "ajuste_caja",
    montoAnterior: current.capitalEmpresa,
    montoNuevo: capitalEmpresa,
    at: Timestamp.fromDate(now),
    jefeUid,
    deltaCaja: delta,
    cajaAnterior: current.cajaEmpresa,
    cajaNueva: cajaEmpresa,
  });
  batch.set(
    ref,
    {
      cajaEmpresa,
      capitalEmpresa,
      jefeUid,
      updatedAt: now,
      historial: FieldValue.delete(),
    },
    { merge: true }
  );
  await batch.commit();

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
      "Saldo insuficiente en base empresa para esta salida"
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
  const antes = await getCapitalEmpresa(db, jefeUid);
  if (antes.cajaEmpresa < monto) {
    throw new Error("Saldo insuficiente en base empresa para asignar al administrador");
  }

  const ref = cajaEmpresaRef(db, jefeUid);
  const now = new Date();
  const cajaEmpresa = antes.cajaEmpresa - monto;
  const montoNuevo = computeCapitalEmpresa(cajaEmpresa, antes.sumaCapitalAdmins);

  const batch = db.batch();
  const flujoRef = capitalEmpresaFlujoCol(db, jefeUid).doc();
  batch.set(flujoRef, {
    tipo: "asignacion_nuevo_admin",
    montoAnterior: antes.capitalEmpresa,
    montoNuevo,
    at: Timestamp.fromDate(now),
    jefeUid,
    montoTransferencia: monto,
    cajaAnterior: antes.cajaEmpresa,
    cajaNueva: cajaEmpresa,
  });
  batch.set(
    ref,
    {
      cajaEmpresa,
      updatedAt: now,
      historial: FieldValue.delete(),
    },
    { merge: true }
  );
  await batch.commit();
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

  const antes = await getCapitalEmpresa(db, jefeUid);

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
      throw new Error("Saldo insuficiente en base empresa");
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
        historial: FieldValue.delete(),
      },
      { merge: true }
    );
    tx.update(adminRef, {
      cajaAdmin: newCajaAdmin,
      ultimaActualizacionCapital: now,
    });
  });

  await persistAggregatedCapitalDocs(db, jefeUid);
  const despues = await getCapitalEmpresa(db, jefeUid);
  await capitalEmpresaFlujoCol(db, jefeUid).add({
    tipo: "inversion_admin",
    montoAnterior: antes.capitalEmpresa,
    montoNuevo: despues.capitalEmpresa,
    at: Timestamp.fromDate(now),
    jefeUid,
    adminUid: adminUid.trim(),
    montoTransferencia: monto,
    cajaAnterior: antes.cajaEmpresa,
    cajaNueva: despues.cajaEmpresa,
  });
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
    throw new Error("Saldo insuficiente en base empresa para este gasto");
  }
  const ref = cajaEmpresaRef(db, jefeUid);
  const nuevaCaja = current.cajaEmpresa - monto;
  const now = new Date();
  const montoNuevo = computeCapitalEmpresa(nuevaCaja, current.sumaCapitalAdmins);

  const batch = db.batch();
  const flujoRef = capitalEmpresaFlujoCol(db, jefeUid).doc();
  batch.set(flujoRef, {
    tipo: "gasto_empresa",
    montoAnterior: current.capitalEmpresa,
    montoNuevo,
    at: Timestamp.fromDate(now),
    jefeUid,
    deltaCaja: -monto,
    cajaAnterior: current.cajaEmpresa,
    cajaNueva: nuevaCaja,
  });
  batch.set(
    ref,
    {
      cajaEmpresa: nuevaCaja,
      updatedAt: now,
      historial: FieldValue.delete(),
    },
    { merge: true }
  );
  await batch.commit();
  return nuevaCaja;
}
