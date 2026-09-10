/**
 * Registra un gasto operativo del trabajador: descuenta `cajaEmpleado` y ajusta la ruta (cajasEmpleados, gastos acumulados).
 */

import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCamposTrasGastoOperativoEmpleado } from "@/lib/empleado-gasto-operativo-compute";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

/**
 * Aplica el gasto del trabajador dentro de una transacción existente, para que
 * el débito de caja y el documento del gasto se confirmen juntos.
 * Los snapshots deben venir de tx.get.
 *
 * @throws "Usuario no encontrado" | "El usuario no es trabajador" | "Ruta no encontrada"
 */
export function applyGastoOperativoEmpleadoEnTx(
  tx: Transaction,
  ctx: {
    usuarioRef: DocumentReference;
    usuarioSnap: DocumentSnapshot;
    rutaRef: DocumentReference;
    rutaSnap: DocumentSnapshot;
    monto: number;
    now: Timestamp;
  }
): { cajaEmpleado: number; cajasEmpleados: number; capitalTotal: number } {
  const { usuarioRef, usuarioSnap, rutaRef, rutaSnap, monto, now } = ctx;

  if (!usuarioSnap.exists) throw new Error("Usuario no encontrado");
  const ud = usuarioSnap.data() as Record<string, unknown>;
  if ((ud.rol as string) !== "empleado") {
    throw new Error("El usuario no es trabajador");
  }
  const cajaEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;

  if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
  const ruta = rutaSnap.data() as Record<string, unknown>;

  const gasto = computeCamposTrasGastoOperativoEmpleado({
    monto,
    cajaActual: cajaEmp,
    gastosDelDia: 0,
    cajaRuta: (ruta.cajaRuta as number) ?? 0,
    cajasEmpleados: (ruta.cajasEmpleados as number) ?? 0,
    inversiones: (ruta.inversiones as number) ?? 0,
    perdidas: (ruta.perdidas as number) ?? 0,
  });

  tx.update(usuarioRef, {
    cajaEmpleado: gasto.cajaActual,
    ultimaActualizacionCapital: now,
  });

  tx.update(rutaRef, {
    cajasEmpleados: gasto.cajasEmpleados,
    gastos: ((ruta.gastos as number) ?? 0) + monto,
    capitalTotal: gasto.capitalTotal,
    ultimaActualizacion: now,
  });

  return {
    cajaEmpleado: gasto.cajaActual,
    cajasEmpleados: gasto.cajasEmpleados,
    capitalTotal: gasto.capitalTotal,
  };
}

export function usuarioEmpresaRef(
  db: Firestore,
  empresaId: string,
  uid: string
): DocumentReference {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(uid);
}

export function rutaEmpresaRef(
  db: Firestore,
  empresaId: string,
  rutaId: string
): DocumentReference {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);
}

export async function registrarGastoOperativoEmpleadoDesdeApi(
  db: Firestore,
  empresaId: string,
  empleadoUid: string,
  rutaId: string,
  monto: number,
  descripcion: string,
  categoria: "transporte" | "alimentacion" | "otro"
): Promise<void> {
  if (!empresaId || !empleadoUid || !rutaId) {
    throw new Error("empresaId, empleadoUid y rutaId son obligatorios");
  }
  if (monto <= 0) {
    throw new Error("El monto del gasto debe ser mayor que cero");
  }

  const usuarioRef = usuarioEmpresaRef(db, empresaId, empleadoUid);
  const rutaRef = rutaEmpresaRef(db, empresaId, rutaId);

  await db.runTransaction(async (tx) => {
    const usuarioSnap = await tx.get(usuarioRef);
    const rutaSnap = await tx.get(rutaRef);
    applyGastoOperativoEmpleadoEnTx(tx, {
      usuarioRef,
      usuarioSnap,
      rutaRef,
      rutaSnap,
      monto,
      now: Timestamp.now(),
    });
  });

  const rutaAfter = await rutaRef.get();
  if (rutaAfter.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, rutaAfter.data()!);
  }
}
