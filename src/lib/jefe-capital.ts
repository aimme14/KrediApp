/**
 * Servicio de capital de empresa (nivel jefe).
 * capitalEmpresa (en API) = cajaEmpresa + suma(capitalAdmin); no se persiste en el doc Firestore.
 * Persistencia: empresas/{jefeUid}/capital/cajaEmpresa (sin documento "actual").
 */

import type {
  DocumentSnapshot,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
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
import { applySumarCajaAdminEnTx, cajaAdminRef } from "@/lib/admin-capital";

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
 * Aplica un movimiento de caja empresa dentro de una transacción existente.
 *
 * Solo `cajaEmpresa` es dinero: se lee con `tx.get` y se valida contra el saldo
 * bloqueado por la transacción. `sumaCapitalAdmins` se recibe ya calculada
 * porque alimenta únicamente los campos de display del historial
 * (`montoAnterior` / `montoNuevo`); calcularla dentro obligaría a leer todas las
 * rutas y gastos de la empresa en cada movimiento.
 */
export function applyMovimientoCajaEmpresaEnTx(
  tx: Transaction,
  ctx: {
    db: Firestore;
    jefeUid: string;
    cajaEmpresaSnap: DocumentSnapshot;
    /** Nueva caja a partir del saldo bloqueado en la transacción. */
    calcularNuevaCaja: (cajaActual: number) => number;
    tipo: CapitalEmpresaFlujoTipo;
    sumaCapitalAdmins: number;
    /** Variación de la suma de capital de admins (traspasos a caja de admin). */
    deltaSumaCapitalAdmins?: number;
    mensajeSaldoInsuficiente: string;
    now: Date;
    incluirJefeUid?: boolean;
    extraFlujo?: Record<string, unknown>;
  }
): { cajaEmpresa: number; capitalEmpresa: number; cajaAnterior: number } {
  const {
    db,
    jefeUid,
    cajaEmpresaSnap,
    calcularNuevaCaja,
    tipo,
    sumaCapitalAdmins,
    deltaSumaCapitalAdmins = 0,
    mensajeSaldoInsuficiente,
    now,
    incluirJefeUid,
    extraFlujo,
  } = ctx;

  const data = cajaEmpresaSnap.exists ? cajaEmpresaSnap.data()! : {};
  const cajaAnterior =
    typeof data.cajaEmpresa === "number" ? data.cajaEmpresa : 0;

  const cajaEmpresa = calcularNuevaCaja(cajaAnterior);
  if (cajaEmpresa < 0) throw new Error(mensajeSaldoInsuficiente);

  const capitalAnterior = computeCapitalEmpresa(cajaAnterior, sumaCapitalAdmins);
  const capitalEmpresa = computeCapitalEmpresa(
    cajaEmpresa,
    sumaCapitalAdmins + deltaSumaCapitalAdmins
  );

  const flujoRef = capitalEmpresaFlujoCol(db, jefeUid).doc();
  tx.set(flujoRef, {
    tipo,
    montoAnterior: capitalAnterior,
    montoNuevo: capitalEmpresa,
    at: Timestamp.fromDate(now),
    jefeUid,
    cajaAnterior,
    cajaNueva: cajaEmpresa,
    ...(extraFlujo ?? {}),
  });

  const payload: Record<string, unknown> = {
    cajaEmpresa,
    capitalEmpresa: FieldValue.delete(),
    updatedAt: now,
    historial: FieldValue.delete(),
  };
  if (incluirJefeUid) payload.jefeUid = jefeUid;

  tx.set(cajaEmpresaRef(db, jefeUid), payload, { merge: true });

  return { cajaEmpresa, capitalEmpresa, cajaAnterior };
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

  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    jefeUid
  );
  const ref = cajaEmpresaRef(db, jefeUid);

  await db.runTransaction(async (tx) => {
    const cajaEmpresaSnap = await tx.get(ref);
    applyMovimientoCajaEmpresaEnTx(tx, {
      db,
      jefeUid,
      cajaEmpresaSnap,
      calcularNuevaCaja: () => monto - sumaCapitalAdmins,
      tipo: "cuadrar_caja",
      sumaCapitalAdmins,
      mensajeSaldoInsuficiente:
        "El capital total no puede ser menor a la suma de capitales de administradores",
      now: new Date(),
      incluirJefeUid: true,
    });
  });

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
  if (delta === 0) return getCapitalEmpresa(db, jefeUid);

  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    jefeUid
  );
  const ref = cajaEmpresaRef(db, jefeUid);

  await db.runTransaction(async (tx) => {
    const cajaEmpresaSnap = await tx.get(ref);
    applyMovimientoCajaEmpresaEnTx(tx, {
      db,
      jefeUid,
      cajaEmpresaSnap,
      calcularNuevaCaja: (cajaActual) => cajaActual + delta,
      tipo: "ajuste_caja",
      sumaCapitalAdmins,
      mensajeSaldoInsuficiente:
        "Saldo insuficiente en la caja de la empresa. No se puede restar más de lo disponible.",
      now: new Date(),
      incluirJefeUid: true,
      extraFlujo: { deltaCaja: delta },
    });
  });

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

  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    jefeUid
  );
  const ref = cajaEmpresaRef(db, jefeUid);

  await db.runTransaction(async (tx) => {
    const cajaEmpresaSnap = await tx.get(ref);
    applyMovimientoCajaEmpresaEnTx(tx, {
      db,
      jefeUid,
      cajaEmpresaSnap,
      calcularNuevaCaja: (cajaActual) => cajaActual - monto,
      tipo: "asignacion_nuevo_admin",
      sumaCapitalAdmins,
      mensajeSaldoInsuficiente:
        "Saldo insuficiente en la caja de la empresa para asignar al administrador",
      now: new Date(),
      extraFlujo: { montoTransferencia: monto },
    });
  });
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

  const adminRef = cajaAdminRef(db, jefeUid, adminId);
  const ref = cajaEmpresaRef(db, jefeUid);

  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    jefeUid
  );

  await db.runTransaction(async (tx) => {
    const [adminSnap, cajaEmpresaSnap] = await Promise.all([
      tx.get(adminRef),
      tx.get(ref),
    ]);

    if (!adminSnap.exists) {
      throw new Error("El administrador no pertenece a esta empresa o no existe");
    }
    const adminData = adminSnap.data() as Record<string, unknown>;
    if ((adminData.rol as string | undefined) !== "admin") {
      throw new Error("El usuario indicado no es un administrador de la empresa");
    }

    const nombreAdmin =
      typeof adminData.nombre === "string" && adminData.nombre.trim()
        ? adminData.nombre.trim()
        : typeof adminData.email === "string"
          ? adminData.email
          : adminId;

    const now = new Date();

    applyMovimientoCajaEmpresaEnTx(tx, {
      db,
      jefeUid,
      cajaEmpresaSnap,
      calcularNuevaCaja: (cajaActual) => cajaActual - monto,
      tipo: "inversion_caja_admin",
      sumaCapitalAdmins,
      deltaSumaCapitalAdmins: monto,
      mensajeSaldoInsuficiente:
        "Saldo insuficiente en la caja de la empresa para invertir en la caja del administrador",
      now,
      extraFlujo: {
        adminUid: adminId,
        adminNombre: nombreAdmin,
        montoTransferencia: monto,
      },
    });

    applySumarCajaAdminEnTx(tx, { adminRef, adminSnap, monto, now });
  });

  await persistAggregatedCapitalDocs(db, jefeUid);
  return getCapitalEmpresa(db, jefeUid);
}

/**
 * Descuenta un gasto de la caja empresa dentro de una transacción existente,
 * para que el débito y el documento del gasto se confirmen juntos.
 *
 * @throws "Saldo insuficiente en la caja de la empresa para este gasto"
 */
export function applyDescontarCajaEmpresaEnTx(
  tx: Transaction,
  ctx: {
    db: Firestore;
    jefeUid: string;
    cajaEmpresaSnap: DocumentSnapshot;
    monto: number;
    sumaCapitalAdmins: number;
    now: Date;
  }
): number {
  const { db, jefeUid, cajaEmpresaSnap, monto, sumaCapitalAdmins, now } = ctx;
  if (monto <= 0) throw new Error("El monto del gasto debe ser mayor a 0");

  const { cajaEmpresa } = applyMovimientoCajaEmpresaEnTx(tx, {
    db,
    jefeUid,
    cajaEmpresaSnap,
    calcularNuevaCaja: (cajaActual) => cajaActual - monto,
    tipo: "gasto_empresa",
    sumaCapitalAdmins,
    mensajeSaldoInsuficiente:
      "Saldo insuficiente en la caja de la empresa para este gasto",
    now,
    extraFlujo: { deltaCaja: -monto },
  });

  return cajaEmpresa;
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

  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    jefeUid
  );
  const ref = cajaEmpresaRef(db, jefeUid);

  return db.runTransaction(async (tx) => {
    const cajaEmpresaSnap = await tx.get(ref);
    return applyDescontarCajaEmpresaEnTx(tx, {
      db,
      jefeUid,
      cajaEmpresaSnap,
      monto,
      sumaCapitalAdmins,
      now: new Date(),
    });
  });
}
