/**
 * Servicio de capital de empresa (nivel jefe).
 * capitalEmpresa (en API) = cajaEmpresa + suma(capitalAdmin); no se persiste en el doc Firestore.
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
  | "cuadrar_caja"
  /** @deprecated Legado en Firestore; nuevos movimientos usan `cuadrar_caja`. */
  | "definicion_capital"
  | "ajuste_caja"
  | "inversion_admin"
  | "gasto_empresa"
  | "asignacion_nuevo_admin"
  /** Base empresa → cajaAdmin de un administrador existente (capital total sin cambio neto). */
  | "inversion_caja_admin"
  /** @deprecated Renombrado a `inversion_caja_admin`; conservar lectura de histórico. */
  | "traspaso_base_admin";

export interface CapitalEmpresaHistorialEntry {
  id?: string;
  montoAnterior: number;
  montoNuevo: number;
  at: Date;
  tipo?: CapitalEmpresaFlujoTipo;
  /** Presente en flujos de asignación / inversión a admin (desde base empresa). */
  montoTransferencia?: number;
  deltaCaja?: number;
  cajaAnterior?: number;
  cajaNueva?: number;
  adminUid?: string;
  adminNombre?: string;
}

/** Serializa una entrada de historial para respuestas JSON (API jefe). */
export function historialCapitalEmpresaToJson(h: CapitalEmpresaHistorialEntry) {
  const atIso = h.at instanceof Date ? h.at.toISOString() : null;
  const row: Record<string, unknown> = {
    id: h.id,
    tipo: h.tipo,
    montoAnterior: h.montoAnterior,
    montoNuevo: h.montoNuevo,
    at: atIso,
  };
  if (typeof h.montoTransferencia === "number") {
    row.montoTransferencia = h.montoTransferencia;
  }
  if (typeof h.deltaCaja === "number") row.deltaCaja = h.deltaCaja;
  if (typeof h.cajaAnterior === "number") row.cajaAnterior = h.cajaAnterior;
  if (typeof h.cajaNueva === "number") row.cajaNueva = h.cajaNueva;
  if (typeof h.adminUid === "string") row.adminUid = h.adminUid;
  if (typeof h.adminNombre === "string") row.adminNombre = h.adminNombre;
  return row;
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
      const entry: CapitalEmpresaHistorialEntry = {
        id: d.id,
        montoAnterior: typeof x.montoAnterior === "number" ? x.montoAnterior : 0,
        montoNuevo: typeof x.montoNuevo === "number" ? x.montoNuevo : 0,
        at: atRaw?.toDate?.() ?? new Date(0),
        tipo:
          typeof tipoRaw === "string"
            ? (tipoRaw as CapitalEmpresaFlujoTipo)
            : undefined,
      };
      if (typeof x.montoTransferencia === "number") {
        entry.montoTransferencia = x.montoTransferencia;
      }
      if (typeof x.deltaCaja === "number") entry.deltaCaja = x.deltaCaja;
      if (typeof x.cajaAnterior === "number") entry.cajaAnterior = x.cajaAnterior;
      if (typeof x.cajaNueva === "number") entry.cajaNueva = x.cajaNueva;
      if (typeof x.adminUid === "string") entry.adminUid = x.adminUid;
      if (typeof x.adminNombre === "string") entry.adminNombre = x.adminNombre;
      return entry;
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
 * Cuadrar caja / capital de empresa: monto = capitalEmpresa deseado.
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
    tipo: "cuadrar_caja",
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
      capitalEmpresa: FieldValue.delete(),
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
      "Saldo insuficiente en la caja de la empresa. No se puede restar más de lo disponible."
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
      capitalEmpresa: FieldValue.delete(),
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
      "Saldo insuficiente en la caja de la empresa para esta salida"
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
    throw new Error("Saldo insuficiente en la caja de la empresa para asignar al administrador");
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
      capitalEmpresa: FieldValue.delete(),
      updatedAt: now,
      historial: FieldValue.delete(),
    },
    { merge: true }
  );
  await batch.commit();
}

/**
 * Inversión a caja de administrador: efectivo de la base empresa → cajaAdmin.
 * Valida que el usuario exista en `empresas/{jefeUid}/usuarios/{adminUid}` con rol `admin`.
 */
export async function transferirBaseEmpresaAAdmin(
  db: Firestore,
  jefeUid: string,
  adminUid: string,
  monto: number
): Promise<CapitalEmpresaDoc> {
  if (!adminUid || typeof adminUid !== "string" || !adminUid.trim()) {
    throw new Error("Debes indicar un administrador");
  }
  const adminId = adminUid.trim();
  if (adminId === jefeUid) {
    throw new Error("No puedes invertir en caja del propio jefe como administrador");
  }
  if (monto <= 0) throw new Error("El monto de la inversión debe ser mayor a 0");

  const adminRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(jefeUid)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminId);

  const adminSnap = await adminRef.get();
  if (!adminSnap.exists) {
    throw new Error("El administrador no pertenece a esta empresa o no existe");
  }
  const adminData = adminSnap.data() as Record<string, unknown>;
  if ((adminData.rol as string | undefined) !== "admin") {
    throw new Error("El usuario indicado no es un administrador de la empresa");
  }

  const antes = await getCapitalEmpresa(db, jefeUid);
  if (antes.cajaEmpresa < monto) {
    throw new Error("Saldo insuficiente en la caja de la empresa para invertir en la caja del administrador");
  }

  const cajaEmpresa = antes.cajaEmpresa - monto;
  const sumaDespues = antes.sumaCapitalAdmins + monto;
  const capitalAntes = antes.capitalEmpresa;
  const capitalDespues = computeCapitalEmpresa(cajaEmpresa, sumaDespues);

  const ref = cajaEmpresaRef(db, jefeUid);
  const now = new Date();
  const nombreAdmin =
    typeof adminData.nombre === "string" && adminData.nombre.trim()
      ? adminData.nombre.trim()
      : typeof adminData.email === "string"
        ? adminData.email
        : adminId;

  const batch = db.batch();
  const flujoRef = capitalEmpresaFlujoCol(db, jefeUid).doc();
  batch.set(flujoRef, {
    tipo: "inversion_caja_admin",
    montoAnterior: capitalAntes,
    montoNuevo: capitalDespues,
    at: Timestamp.fromDate(now),
    jefeUid,
    adminUid: adminId,
    adminNombre: nombreAdmin,
    montoTransferencia: monto,
    cajaAnterior: antes.cajaEmpresa,
    cajaNueva: cajaEmpresa,
  });
  batch.set(
    ref,
    {
      cajaEmpresa,
      capitalEmpresa: FieldValue.delete(),
      updatedAt: now,
      historial: FieldValue.delete(),
    },
    { merge: true }
  );
  batch.update(adminRef, {
    cajaAdmin: FieldValue.increment(monto),
    ultimaActualizacionCapital: now,
  });
  await batch.commit();

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
    throw new Error("Saldo insuficiente en la caja de la empresa para este gasto");
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
      capitalEmpresa: FieldValue.delete(),
      updatedAt: now,
      historial: FieldValue.delete(),
    },
    { merge: true }
  );
  await batch.commit();
  return nuevaCaja;
}
