/**
 * Operaciones financieras sobre rutas usando Firebase Admin (para API routes).
 * La lógica pura compartida con el cliente está en `ruta-financiera-compute.ts`.
 */

import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  JORNADAS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { getJornadaActivaEmpleado } from "@/lib/jornada-gasto-admin";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { round2 } from "./ruta-financiera-compute";

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
    ultimaActualizacion: new Date(),
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }
}

/**
 * Préstamo desde la caja del trabajador: descuenta cajaEmpleado (o jornada) y mueve a inversiones.
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

  const preJ = await getJornadaActivaEmpleado(db, empresaId, empleadoUid);
  if (preJ && preJ.rutaId !== rutaId) {
    throw new Error("El trabajador tiene una jornada activa en otra ruta");
  }

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
  const jornadaRef =
    preJ && preJ.rutaId === rutaId
      ? db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(JORNADAS_SUBCOLLECTION)
          .doc(preJ.jornadaId)
      : null;

  await db.runTransaction(async (tx) => {
    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
    const rd = rutaSnap.data() as Record<string, unknown>;

    let cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
    let cajasEmpleados = typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
    let inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
    const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;
    const capitalTotal = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });

    let jornadaOk: DocumentReference | null = null;
    let cajaActual = 0;
    let cajaEmp = 0;

    if (jornadaRef) {
      const jSnap = await tx.get(jornadaRef);
      const jd = jSnap.data() as Record<string, unknown> | undefined;
      if (
        jSnap.exists &&
        jd &&
        jd.estado === "activa" &&
        (jd.rutaId as string) === rutaId
      ) {
        jornadaOk = jornadaRef;
        cajaActual = typeof jd.cajaActual === "number" ? jd.cajaActual : 0;
      }
    }

    const uSnap = await tx.get(usuarioRef);
    if (!jornadaOk) {
      if (!uSnap.exists) throw new Error("Trabajador no encontrado");
      const ud = uSnap.data() as Record<string, unknown>;
      if ((ud.rol as string) !== "empleado") throw new Error("El usuario no es trabajador");
      cajaEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;
      if (cajaEmp < monto) throw new Error("Saldo insuficiente en la base del trabajador");
    } else {
      if (cajaActual < monto) throw new Error("Saldo insuficiente en la jornada");
    }

    if (cajasEmpleados < monto) {
      throw new Error("Saldo insuficiente en bases de empleados de la ruta");
    }

    cajasEmpleados = round2(cajasEmpleados - monto);
    inversiones = round2(inversiones + monto);

    const suma = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });
    if (Math.abs(suma - capitalTotal) > 0.02) {
      throw new Error("Capital descuadrado — revisar operación");
    }

    const now = new Date();

    if (jornadaOk) {
      tx.update(jornadaOk, {
        cajaActual: round2(cajaActual - monto),
      });
    } else {
      tx.update(usuarioRef, {
        cajaEmpleado: round2(cajaEmp - monto),
        ultimaActualizacionCapital: now,
      });
    }

    tx.update(rutaRef, {
      cajasEmpleados,
      inversiones,
      ultimaActualizacion: now,
    });
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }
}
