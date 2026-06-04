/**
 * Transfiere liquidez de la caja de una ruta a la caja del administrador (decrementa cajaRuta y capitalTotal).
 */

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  INVERSIONES_RUTA_CAJA_ADMIN_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalRutaFromRutaFields } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

export type InvertirRutaEnCajaAdminResult = {
  cajaAdmin: number;
  cajaRuta: number;
  capitalTotal: number;
};

/**
 * Descuenta `monto` de cajaRuta y lo suma a cajaAdmin del administrador dueño de la ruta.
 */
export async function invertirRutaEnCajaAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  rutaId: string,
  monto: number
): Promise<InvertirRutaEnCajaAdminResult> {
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
      throw new Error("Solo puedes retirar de rutas que administras");
    }

    const oldCajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
    if (oldCajaRuta < monto) {
      throw new Error("Saldo insuficiente en la base de la ruta");
    }

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

    const cajaActual =
      userSnap.exists && typeof userSnap.data()?.cajaAdmin === "number"
        ? userSnap.data()!.cajaAdmin
        : 0;

    const nuevaCajaRuta = Math.round((oldCajaRuta - monto) * 100) / 100;
    const nuevoCapitalTotal = Math.round((capitalAntes - monto) * 100) / 100;
    const nuevaCajaAdmin = Math.round((cajaActual + monto) * 100) / 100;

    const now = new Date();
    const rutaNombre = typeof rd.nombre === "string" ? rd.nombre.trim() : "";

    tx.update(userRef, {
      cajaAdmin: nuevaCajaAdmin,
      ultimaActualizacionCapital: now,
    });

    tx.update(rutaRef, {
      cajaRuta: nuevaCajaRuta,
      capitalTotal: nuevoCapitalTotal,
      ultimaActualizacion: now,
    });

    return {
      cajaAdmin: nuevaCajaAdmin,
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

  await userRef.collection(INVERSIONES_RUTA_CAJA_ADMIN_SUBCOLLECTION).add({
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
