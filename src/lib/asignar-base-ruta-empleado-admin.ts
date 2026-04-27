/**
 * Pasa efectivo de cajaRuta (base de la ruta) a la caja del trabajador (`cajaEmpleado`).
 * capitalTotal no cambia (solo reparte entre cajaRuta y cajasEmpleados).
 */

import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION,
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function assertCapitalRuta(
  cajaRuta: number,
  cajasEmpleados: number,
  inversiones: number,
  perdidas: number,
  capitalTotal: number
) {
  if (cajaRuta < 0) throw new Error("Saldo insuficiente en la base de la ruta");
  if (cajasEmpleados < 0) throw new Error("Saldo insuficiente en base del empleado");
  if (inversiones < 0) throw new Error("Saldo de inversiones negativo");
  const esperado = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });
  if (Math.abs(esperado - capitalTotal) > 0.02) {
    throw new Error("Capital descuadrado — revisar operación");
  }
}

function empleadoPerteneceARuta(
  data: Record<string, unknown>,
  empleadoUid: string
): boolean {
  const legacy = typeof data.empleadoId === "string" ? data.empleadoId.trim() : "";
  if (legacy && legacy === empleadoUid) return true;
  const ids = data.empleadosIds;
  if (Array.isArray(ids)) {
    return ids.some((x) => typeof x === "string" && x === empleadoUid);
  }
  return false;
}

export type AsignarBaseRutaEmpleadoResult = {
  cajaRuta: number;
  cajasEmpleados: number;
  baseTrabajador: number;
};

export async function asignarBaseCajaRutaAEmpleado(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  rutaId: string,
  empleadoUid: string,
  monto: number
): Promise<AsignarBaseRutaEmpleadoResult> {
  if (!empresaId || !rutaId || !empleadoUid) {
    throw new Error("Datos incompletos");
  }
  const m = round2(monto);
  if (m <= 0) throw new Error("El monto debe ser mayor a cero");

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

  const resultado = await db.runTransaction(async (tx) => {
    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
    const rd = rutaSnap.data() as Record<string, unknown>;
    if ((rd.adminId as string) !== adminUid) {
      throw new Error("Solo puedes operar rutas que administras");
    }

    const usuarioSnap = await tx.get(usuarioRef);
    const ud0 = usuarioSnap.data() as Record<string, unknown> | undefined;
    const asignadoEnRutaDoc = empleadoPerteneceARuta(rd, empleadoUid);
    const asignadoEnUsuario =
      usuarioSnap.exists &&
      ud0 &&
      (ud0.rol as string) === "empleado" &&
      typeof ud0.rutaId === "string" &&
      ud0.rutaId === rutaId;
    if (!asignadoEnRutaDoc && !asignadoEnUsuario) {
      throw new Error("Este trabajador no está asignado a esta ruta");
    }

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

    if (cajaRuta < m) {
      throw new Error("Saldo insuficiente en la base de la ruta");
    }

    if (!usuarioSnap.exists) throw new Error("Trabajador no encontrado en la empresa");
    const ud = usuarioSnap.data() as Record<string, unknown>;
    if ((ud.rol as string | undefined) !== "empleado") {
      throw new Error("El usuario no es un trabajador");
    }
    const cajaEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;

    cajaRuta = round2(cajaRuta - m);
    cajasEmpleados = round2(cajasEmpleados + m);
    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, perdidas, capitalTotal);

    const now = Timestamp.now();
    const baseTrabajador = round2(cajaEmp + m);

    const asignRef = usuarioRef
      .collection(ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION)
      .doc();
    tx.set(asignRef, {
      monto: m,
      fecha: now,
      rutaId,
      adminUid,
      empresaId,
    });

    tx.update(usuarioRef, {
      cajaEmpleado: baseTrabajador,
      ultimaActualizacionCapital: now,
    });

    tx.update(rutaRef, {
      cajaRuta,
      cajasEmpleados,
      capitalTotal,
      ultimaActualizacion: now,
    });

    return { cajaRuta, cajasEmpleados, baseTrabajador };
  });

  const rutaAfter = await rutaRef.get();
  if (rutaAfter.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, rutaAfter.data()!);
  }

  return resultado;
}
