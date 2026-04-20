/**
 * Cálculos puros de impacto en ruta (cobro / pérdida). Sin Firebase — cliente y API comparten la misma lógica.
 */

import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";

export function round2(n: number): number {
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
 * Cobro que ingresa a caja de ruta: el efectivo sube cajaRuta; solo la parte capital recupera inversión.
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
