/**
 * Pasa el efectivo de la base del trabajador (`cajaEmpleado`) a la base de la ruta (`cajaRuta`).
 * capitalTotal no cambia.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type EntregarReporteResult = {
  monto: number;
  rutaId: string;
};

/** Vista previa del efectivo que se movería al aprobar la entrega (sin mutar datos). */
export type PreviewEntregaReporte = {
  rutaId: string;
  rutaNombre: string;
  adminId: string;
  monto: number;
  empleadoNombre: string;
};

export async function getPreviewEntregaReporteTrabajador(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<PreviewEntregaReporte> {
  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const uSnap = await usuarioRef.get();
  if (!uSnap.exists) throw new Error("Usuario no encontrado");
  const ud = uSnap.data() as Record<string, unknown>;
  if ((ud.rol as string) !== "empleado") throw new Error("Solo aplica a trabajadores");
  const rutaId = typeof ud.rutaId === "string" ? ud.rutaId.trim() : "";
  if (!rutaId) throw new Error("No tienes ruta asignada");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const rutaSnap = await rutaRef.get();
  if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
  const rd = rutaSnap.data() as Record<string, unknown>;
  const adminId = typeof rd.adminId === "string" ? rd.adminId.trim() : "";
  const rutaNombre = typeof rd.nombre === "string" ? rd.nombre.trim() : "";

  const cEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;
  const monto = round2(cEmp);

  const authSnap = await db.collection(USERS_COLLECTION).doc(empleadoUid).get();
  const empleadoNombre =
    (authSnap.data()?.displayName as string | undefined)?.trim() || "—";

  return {
    rutaId,
    rutaNombre,
    adminId,
    monto,
    empleadoNombre,
  };
}

export async function entregarReporteTrabajadorARuta(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<EntregarReporteResult> {
  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const uSnap = await usuarioRef.get();
  if (!uSnap.exists) throw new Error("Usuario no encontrado");
  const ud = uSnap.data() as Record<string, unknown>;
  if ((ud.rol as string) !== "empleado") throw new Error("Solo aplica a trabajadores");
  const rutaId = typeof ud.rutaId === "string" ? ud.rutaId.trim() : "";
  if (!rutaId) throw new Error("No tienes ruta asignada");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  let montoEntregado = 0;

  await db.runTransaction(async (tx) => {
    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
    const rd = rutaSnap.data() as Record<string, unknown>;

    let cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
    let cajasEmpleados = typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
    const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
    const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;
    const capitalTotal =
      typeof rd.capitalTotal === "number"
        ? rd.capitalTotal
        : computeCapitalTotalRutaDesdeSaldos({
            cajaRuta,
            cajasEmpleados,
            inversiones,
            perdidas,
          });

    const now = new Date();

    const uSnapTx = await tx.get(usuarioRef);
    const udx = uSnapTx.data() as Record<string, unknown>;
    const cEmp = typeof udx?.cajaEmpleado === "number" ? udx.cajaEmpleado : 0;
    const monto = round2(cEmp);
    if (monto <= 0) throw new Error("No hay efectivo en tu base para entregar");
    if (cajasEmpleados < monto) throw new Error("Bases empleados de la ruta no coinciden");

    cajaRuta = round2(cajaRuta + monto);
    cajasEmpleados = round2(cajasEmpleados - monto);
    const suma = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });
    if (Math.abs(suma - capitalTotal) > 0.02) throw new Error("Capital descuadrado");

    montoEntregado = monto;
    tx.update(usuarioRef, {
      cajaEmpleado: 0,
      ultimaActualizacionCapital: now,
    });
    tx.update(rutaRef, { cajaRuta, cajasEmpleados, ultimaActualizacion: now });
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }

  return { monto: montoEntregado, rutaId };
}
