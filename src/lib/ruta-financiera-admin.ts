/**
 * Operaciones financieras sobre rutas usando Firebase Admin (para API routes).
 * La lógica pura compartida con el cliente está en `ruta-financiera-compute.ts`.
 */

import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import {
  computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado,
  round2,
} from "./ruta-financiera-compute";

/** Reexporta la única fuente de verdad para splits y efectos en ruta (comparte con cliente vía `ruta-financiera-compute`). */
export {
  round2,
  splitMontoPagoEnCapitalYGanancia,
  type RutaUpdateCobro,
  computeRutaCamposTrasCobroPrestamo,
  type RutaUpdateCobroEnEmpleado,
  computeRutaCamposTrasCobroPrestamoCobroEnEmpleado,
  type RutaUpdatePerdida,
  computeRutaCamposTrasPerdidaPrestamo,
} from "./ruta-financiera-compute";

/**
 * Impacta la ruta por un nuevo préstamo: cajaRuta -= monto, inversiones += monto.
 * capitalTotal no cambia.
 */
export async function registrarPrestamoEnRuta(
  db: Firestore,
  empresaId: string,
  rutaId: string,
  monto: number
): Promise<void> {
  if (!empresaId || !rutaId) throw new Error("empresaId y rutaId son obligatorios");
  if (monto <= 0) throw new Error("El capital prestado debe ser positivo");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const snap = await rutaRef.get();
  if (!snap.exists) throw new Error("Ruta no encontrada");

  const data = snap.data()!;
  let cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
  const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
  let inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
  const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;
  const capitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });

  if (cajaRuta < monto) throw new Error("Saldo insuficiente en base de la ruta");

  cajaRuta -= monto;
  inversiones += monto;

  const suma = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });
  if (Math.abs(suma - capitalTotal) > 0.02) {
    throw new Error("Capital descuadrado — revisar operación");
  }

  await rutaRef.update({
    cajaRuta,
    inversiones,
    totalPrestado: FieldValue.increment(monto),
    ultimaActualizacion: new Date(),
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }
}

/**
 * Descuenta un gasto operativo desde la caja de una ruta.
 * Solo permite operar al admin propietario de la ruta y valida saldo disponible.
 */
export async function descontarCajaRutaAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  rutaId: string,
  monto: number
): Promise<{ cajaRuta: number; capitalTotal: number }> {
  if (!empresaId || !rutaId || !adminUid) throw new Error("Datos incompletos");
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const result = await db.runTransaction(async (tx) => {
    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");

    const rd = rutaSnap.data() as Record<string, unknown>;
    if ((rd.adminId as string) !== adminUid) {
      throw new Error("Esta ruta no pertenece a tu administración");
    }

    const cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
    const cajasEmpleados =
      typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
    const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
    const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;
    const gastos = typeof rd.gastos === "number" ? rd.gastos : 0;

    if (cajaRuta < monto) {
      throw new Error("Saldo insuficiente en caja de la ruta");
    }

    const nuevaCajaRuta = round2(cajaRuta - monto);
    const nuevoCapitalTotal = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta: nuevaCajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });

    tx.update(rutaRef, {
      cajaRuta: nuevaCajaRuta,
      gastos: round2(gastos + monto),
      capitalTotal: nuevoCapitalTotal,
      ultimaActualizacion: new Date(),
    });

    return { cajaRuta: nuevaCajaRuta, capitalTotal: nuevoCapitalTotal };
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }

  return result;
}

export type DesembolsoEmpleadoEnTxResult = {
  nuevaCajaEmp: number;
  nuevaCajasEmpleados: number;
  nuevaInversiones: number;
  nuevoCapital: number;
};

/** Mensajes en español para códigos de error del desembolso desde caja empleado. */
export function mapDesembolsoPrestamoDesdeCajaEmpleadoError(msg: string): string {
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
  return msg;
}

/**
 * Desembolso de préstamo desde caja del empleado dentro de una transacción existente.
 * Requiere snapshots ya leídos con tx.get (lecturas antes de escrituras).
 */
export function applyDesembolsoPrestamoDesdeCajaEmpleadoEnTx(
  tx: Transaction,
  ctx: {
    rutaSnap: DocumentSnapshot;
    empleadoSnap: DocumentSnapshot;
    empleadoRef: DocumentReference;
    rutaRef: DocumentReference;
    monto: number;
    now: Date;
  }
): DesembolsoEmpleadoEnTxResult {
  const { rutaSnap, empleadoSnap, empleadoRef, rutaRef, monto, now } = ctx;

  if (!rutaSnap.exists) throw new Error("RUTA_NOT_FOUND");
  if (!empleadoSnap.exists) throw new Error("EMPLEADO_NOT_FOUND");

  const rd = rutaSnap.data() as Record<string, unknown>;
  const ud = empleadoSnap.data() as Record<string, unknown>;

  if ((ud.rol as string) !== "empleado") throw new Error("USUARIO_NO_ES_EMPLEADO");

  const cajaEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;
  const cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
  const cajasEmpleados = typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
  const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
  const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;

  const saldos = computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado({
    cajaEmp,
    cajaRuta,
    cajasEmpleados,
    inversiones,
    monto,
    perdidas,
  });

  tx.update(empleadoRef, {
    cajaEmpleado: saldos.nuevaCajaEmp,
    ultimaActualizacionCapital: now,
  });

  tx.update(rutaRef, {
    cajasEmpleados: saldos.nuevaCajasEmpleados,
    inversiones: saldos.nuevaInversiones,
    capitalTotal: saldos.nuevoCapital,
    totalPrestado: FieldValue.increment(monto),
    ultimaActualizacion: now,
  });

  return saldos;
}

/**
 * Préstamo desde la caja del trabajador: descuenta `cajaEmpleado` y mueve a inversiones.
 * cajaRuta no cambia; capitalTotal no cambia.
 */
export async function registrarPrestamoDesdeCajaEmpleado(
  db: Firestore,
  empresaId: string,
  rutaId: string,
  empleadoUid: string,
  monto: number
): Promise<void> {
  if (!empresaId || !rutaId || !empleadoUid) throw new Error("Datos incompletos");
  if (monto <= 0) throw new Error("El capital prestado debe ser positivo");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);
  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  try {
    await db.runTransaction(async (tx) => {
      const now = new Date();
      const [rutaSnap, empleadoSnap] = await Promise.all([
        tx.get(rutaRef),
        tx.get(usuarioRef),
      ]);
      applyDesembolsoPrestamoDesdeCajaEmpleadoEnTx(tx, {
        rutaSnap,
        empleadoSnap,
        empleadoRef: usuarioRef,
        rutaRef,
        monto,
        now,
      });
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(mapDesembolsoPrestamoDesdeCajaEmpleadoError(raw));
  }

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }
}
