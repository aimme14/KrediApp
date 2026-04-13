/**
 * Operaciones financieras sobre rutas usando Firebase Admin (para API routes).
 * Refleja la lógica de services/rutaService para préstamos.
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reparte un cobro entre capital (devuelve inversión) y ganancia (interés),
 * en proporción al préstamo: montoPrestamo / totalAPagar.
 */
export function splitMontoPagoEnCapitalYGanancia(
  montoAplicar: number,
  montoPrestamo: number,
  totalAPagar: number
): { capital: number; ganancia: number } {
  if (montoAplicar <= 0) return { capital: 0, ganancia: 0 };
  if (totalAPagar <= 0) {
    return { capital: round2(montoAplicar), ganancia: 0 };
  }
  const ratio = Math.min(1, Math.max(0, montoPrestamo / totalAPagar));
  const capital = round2(montoAplicar * ratio);
  const ganancia = round2(montoAplicar - capital);
  return { capital, ganancia };
}

export type RutaUpdateCobro = {
  cajaRuta: number;
  inversiones: number;
  ganancias: number;
  capitalTotal: number;
};

/**
 * Cobro que ingresa a caja de ruta: el efectivo sube cajaRuta; solo la parte capital recupera inversión;
 * los intereses quedan reflejados en caja y en `ganancias` (histórico). Patrimonio: cajaRuta+cajasEmpleados+inversiones−perdidas.
 */
export function computeRutaCamposTrasCobroPrestamo(
  rutaData: Record<string, unknown>,
  montoAplicar: number,
  montoPrestamo: number,
  totalAPagar: number
): RutaUpdateCobro {
  let cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
  const cajasEmpleados =
    typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
  let inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;
  let ganancias = typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0;
  const perdidas = typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0;

  const { capital: parteCapital, ganancia: parteGanancia } =
    splitMontoPagoEnCapitalYGanancia(montoAplicar, montoPrestamo, totalAPagar);

  const capitalDescontar = round2(Math.min(parteCapital, inversiones));
  const capitalNoRegistrado = round2(parteCapital - capitalDescontar);
  const gananciaTotal = round2(parteGanancia + capitalNoRegistrado);

  cajaRuta = round2(cajaRuta + montoAplicar);
  inversiones = round2(inversiones - capitalDescontar);
  ganancias = round2(ganancias + gananciaTotal);
  const nuevoCapitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });

  if (cajaRuta < 0 || inversiones < 0) {
    throw new Error("Operación inválida: saldos de ruta negativos");
  }

  return {
    cajaRuta,
    inversiones,
    ganancias,
    capitalTotal: nuevoCapitalTotal,
  };
}

export type RutaUpdateCobroEnEmpleado = {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  capitalTotal: number;
  /** Efectivo total del cobro que ingresa a la caja del trabajador (capital recuperado + interés / ganancia). */
  montoAcreditarCajaEmpleado: number;
};

/**
 * Cobro del trabajador: todo el efectivo cobrado entra en su caja; solo la parte capital reduce `inversiones`
 * (hasta agotar el colocado). El interés no sale de inversiones: queda como ganancia en la caja del trabajador.
 * `ganancias` en la ruta acumula intereses a efectos de reporte.
 */
export function computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
  rutaData: Record<string, unknown>,
  montoAplicar: number,
  montoPrestamo: number,
  totalAPagar: number
): RutaUpdateCobroEnEmpleado {
  const cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
  let cajasEmpleados =
    typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
  let inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;
  let ganancias = typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0;
  const perdidas = typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0;

  const { capital: parteCapital, ganancia: parteGanancia } =
    splitMontoPagoEnCapitalYGanancia(montoAplicar, montoPrestamo, totalAPagar);

  const capitalDescontar = round2(Math.min(parteCapital, inversiones));
  const capitalNoRegistrado = round2(parteCapital - capitalDescontar);
  const gananciaTotal = round2(parteGanancia + capitalNoRegistrado);

  cajasEmpleados = round2(cajasEmpleados + montoAplicar);
  inversiones = round2(inversiones - capitalDescontar);
  ganancias = round2(ganancias + gananciaTotal);
  const nuevoCapitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });

  if (cajaRuta < 0 || inversiones < 0 || cajasEmpleados < 0) {
    throw new Error("Operación inválida: saldos de ruta negativos");
  }

  return {
    cajaRuta,
    cajasEmpleados,
    inversiones,
    ganancias,
    capitalTotal: nuevoCapitalTotal,
    montoAcreditarCajaEmpleado: montoAplicar,
  };
}

export type RutaUpdatePerdida = {
  inversiones: number;
  perdidas: number;
  capitalTotal: number;
};

/**
 * Pérdida reconocida sobre saldo pendiente (incobro parcial o total): sin efectivo en caja.
 * Reparte el monto como en un cobro; el capital descontable reduce `inversiones` y `capitalTotal`;
 * el monto completo suma a `perdidas` (capital no recuperado + interés dejado de ganar).
 */
export function computeRutaCamposTrasPerdidaPrestamo(
  rutaData: Record<string, unknown>,
  montoPerdida: number,
  montoPrestamo: number,
  totalAPagar: number
): RutaUpdatePerdida {
  if (montoPerdida <= 0) {
    throw new Error("El monto de pérdida debe ser mayor a 0");
  }
  const cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
  const cajasEmpleados =
    typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
  let inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;
  let perdidas = typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0;
  const capitalTotal =
    typeof rutaData.capitalTotal === "number"
      ? rutaData.capitalTotal
      : computeCapitalTotalRutaDesdeSaldos({
          cajaRuta,
          cajasEmpleados,
          inversiones,
          perdidas,
        });

  const { capital: parteCapital } = splitMontoPagoEnCapitalYGanancia(
    montoPerdida,
    montoPrestamo,
    totalAPagar
  );
  const capitalDescontar = round2(Math.min(parteCapital, inversiones));
  inversiones = round2(inversiones - capitalDescontar);
  perdidas = round2(perdidas + montoPerdida);
  const nuevoCapitalTotal = round2(capitalTotal - capitalDescontar);

  const suma = round2(cajaRuta + cajasEmpleados + inversiones);
  if (Math.abs(suma - nuevoCapitalTotal) > 0.02) {
    throw new Error("Capital de ruta descuadrado tras pérdida");
  }
  if (inversiones < 0) {
    throw new Error("Operación inválida: saldos de ruta negativos");
  }

  return {
    inversiones,
    perdidas,
    capitalTotal: nuevoCapitalTotal,
  };
}

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
