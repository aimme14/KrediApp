/**
 * Transfiere liquidez de la caja del administrador a la caja de una ruta (incrementa cajaRuta y capitalTotal).
 */

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  INVERSIONES_CAJA_RUTA_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalRutaFromRutaFields } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

export type InvertirCajaRutaResult = {
  cajaAdmin: number;
  cajaRuta: number;
  capitalTotal: number;
};

/**
 * Descuenta `monto` de cajaAdmin y lo suma a la caja de la ruta (y al capital total de la ruta).
 * Solo el admin dueño de la ruta puede ejecutarlo.
 */
export async function invertirAdminEnCajaRuta(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  rutaId: string,
  monto: number
): Promise<InvertirCajaRutaResult> {
  if (!empresaId || !rutaId) throw new Error("Datos incompletos");
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);
  const userRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid);

  const result = await db.runTransaction(async (tx) => {
    const [rutaSnap, userSnap] = await Promise.all([tx.get(rutaRef), tx.get(userRef)]);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
    const rd = rutaSnap.data()!;
    if ((rd.adminId as string) !== adminUid) {
      throw new Error("Solo puedes invertir en rutas que administras");
    }

    const cajaActual =
      userSnap.exists && typeof userSnap.data()?.cajaAdmin === "number"
        ? userSnap.data()!.cajaAdmin
        : 0;
    if (cajaActual < monto) {
      throw new Error("Saldo insuficiente en caja del administrador");
    }

    const oldCajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
    const cajasEmpleados = typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
    const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
    const ganancias = typeof rd.ganancias === "number" ? rd.ganancias : 0;
    const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;
    const capitalTotalRaw =
      typeof rd.capitalTotal === "number" ? rd.capitalTotal : undefined;

    const capitalAntes = computeCapitalRutaFromRutaFields({
      cajaRuta: oldCajaRuta,
      cajasEmpleados,
      inversiones,
      ganancias,
      perdidas,
      capitalTotal: capitalTotalRaw,
    });

    const nuevaCajaRuta = Math.round((oldCajaRuta + monto) * 100) / 100;
    const nuevoCapitalTotal = Math.round((capitalAntes + monto) * 100) / 100;

    const now = new Date();
    const rutaNombre = typeof rd.nombre === "string" ? rd.nombre.trim() : "";

    tx.update(userRef, {
      cajaAdmin: Math.round((cajaActual - monto) * 100) / 100,
      ultimaActualizacionCapital: now,
    });

    tx.update(rutaRef, {
      cajaRuta: nuevaCajaRuta,
      capitalTotal: nuevoCapitalTotal,
      ultimaActualizacion: now,
    });

    return {
      cajaAdmin: Math.round((cajaActual - monto) * 100) / 100,
      cajaRuta: nuevaCajaRuta,
      capitalTotal: nuevoCapitalTotal,
      rutaNombre,
    };
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }

  const usersSnap = await db.collection(USERS_COLLECTION).doc(adminUid).get();
  const u = usersSnap.data();
  const invertidoPorNombre =
    typeof u?.displayName === "string" && u.displayName.trim()
      ? u.displayName.trim()
      : typeof u?.email === "string"
        ? u.email
        : adminUid;

  await userRef.collection(INVERSIONES_CAJA_RUTA_SUBCOLLECTION).add({
    rutaId,
    rutaNombre: result.rutaNombre,
    monto,
    fecha: FieldValue.serverTimestamp(),
    invertidoPorUid: adminUid,
    invertidoPorNombre,
  });

  const { rutaNombre: _rn, ...fin } = result;
  return fin;
}
