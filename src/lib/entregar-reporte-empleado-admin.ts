/**
 * Pasa el efectivo de la base del trabajador a la base de la ruta (cajaRuta).
 * capitalTotal no cambia.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  JORNADAS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { getJornadaActivaEmpleado } from "@/lib/jornada-gasto-admin";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type EntregarReporteResult = {
  monto: number;
  rutaId: string;
};

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

  const preJ = await getJornadaActivaEmpleado(db, empresaId, empleadoUid);
  if (preJ && preJ.rutaId !== rutaId) {
    throw new Error("Tienes una jornada activa en otra ruta");
  }

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const jornadaRef =
    preJ && preJ.rutaId === rutaId
      ? db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(JORNADAS_SUBCOLLECTION)
          .doc(preJ.jornadaId)
      : null;

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

    if (jornadaRef) {
      const jSnap = await tx.get(jornadaRef);
      const jd = jSnap.data() as Record<string, unknown> | undefined;
      if (
        !jSnap.exists ||
        !jd ||
        jd.estado !== "activa" ||
        (jd.rutaId as string) !== rutaId
      ) {
        throw new Error("Estado de jornada inválido");
      }
      const cajaActual = typeof jd.cajaActual === "number" ? jd.cajaActual : 0;
      const entregaInicial = typeof jd.entregaInicial === "number" ? jd.entregaInicial : 0;
      const monto = round2(cajaActual);
      if (monto <= 0) throw new Error("No hay efectivo para entregar");
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
      tx.update(jornadaRef, {
        cajaActual: 0,
        entregaInicial: round2(Math.max(0, entregaInicial - monto)),
      });
      tx.update(rutaRef, { cajaRuta, cajasEmpleados, ultimaActualizacion: now });
    } else {
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
    }
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }

  return { monto: montoEntregado, rutaId };
}
