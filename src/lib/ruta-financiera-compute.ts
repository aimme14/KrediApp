/**
 * Cálculos puros de impacto en ruta (cobro / pérdida). Sin Firebase — cliente y API comparten la misma lógica.
 */

import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ajusta a peso entero si el valor está a ≤1 centavo (drift proporcional). */
export function snapPesoCOP(n: number): number {
  const entero = Math.round(n);
  if (Math.abs(n - entero) <= 0.01) return entero;
  return round2(n);
}

/**
 * Reparte un cobro entre capital (devuelve inversión) y ganancia (interés),
 * en proporción al préstamo: montoPrestamo / totalAPagar.
 *
 * Con `cobradoAcumuladoAntes`, la ganancia del pago es el delta del interés
 * acumulado ideal (evita 19.999,99 en lugar de 20.000 al cerrar el préstamo).
 */
export function splitMontoPagoEnCapitalYGanancia(
  montoAplicar: number,
  montoPrestamo: number,
  totalAPagar: number,
  cobradoAcumuladoAntes?: number
): { capital: number; ganancia: number } {
  if (montoAplicar <= 0) return { capital: 0, ganancia: 0 };
  if (totalAPagar <= 0) {
    return { capital: round2(montoAplicar), ganancia: 0 };
  }

  const gananciaTotal = round2(totalAPagar - montoPrestamo);
  if (gananciaTotal <= 0) {
    return { capital: round2(montoAplicar), ganancia: 0 };
  }

  if (typeof cobradoAcumuladoAntes === "number" && cobradoAcumuladoAntes >= 0) {
    const cobradoAntes = round2(cobradoAcumuladoAntes);
    const cobradoDespues = round2(cobradoAntes + montoAplicar);
    const gananciaIdealDespues = snapPesoCOP(
      round2(cobradoDespues * (gananciaTotal / totalAPagar))
    );
    const gananciaIdealAntes = snapPesoCOP(
      round2(cobradoAntes * (gananciaTotal / totalAPagar))
    );
    const ganancia = round2(gananciaIdealDespues - gananciaIdealAntes);
    const capital = round2(montoAplicar - ganancia);
    return { capital, ganancia };
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
  totalAPagar: number,
  cobradoAcumuladoAntes?: number
): RutaUpdateCobro {
  let cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
  const cajasEmpleados =
    typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
  let inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;
  let ganancias = typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0;
  const perdidas = typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0;

  const { capital: parteCapital, ganancia: parteGanancia } =
    splitMontoPagoEnCapitalYGanancia(
      montoAplicar,
      montoPrestamo,
      totalAPagar,
      cobradoAcumuladoAntes
    );

  const capitalDescontar = round2(Math.min(parteCapital, inversiones));
  const capitalNoRegistrado = round2(parteCapital - capitalDescontar);
  const gananciaTotal = round2(parteGanancia + capitalNoRegistrado);

  cajaRuta = round2(cajaRuta + montoAplicar);
  inversiones = round2(inversiones - capitalDescontar);
  ganancias = snapPesoCOP(round2(ganancias + gananciaTotal));
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
  totalAPagar: number,
  cobradoAcumuladoAntes?: number
): RutaUpdateCobroEnEmpleado {
  const cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
  let cajasEmpleados =
    typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
  let inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;
  let ganancias = typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0;
  const perdidas = typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0;

  const { capital: parteCapital, ganancia: parteGanancia } =
    splitMontoPagoEnCapitalYGanancia(
      montoAplicar,
      montoPrestamo,
      totalAPagar,
      cobradoAcumuladoAntes
    );

  const capitalDescontar = round2(Math.min(parteCapital, inversiones));
  const capitalNoRegistrado = round2(parteCapital - capitalDescontar);
  const gananciaTotal = round2(parteGanancia + capitalNoRegistrado);

  cajasEmpleados = round2(cajasEmpleados + montoAplicar);
  inversiones = round2(inversiones - capitalDescontar);
  ganancias = snapPesoCOP(round2(ganancias + gananciaTotal));
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
  ganancias: number;
  perdidas: number;
  capitalTotal: number;
};

/**
 * Pérdida reconocida al castigar el saldo pendiente completo (sin efectivo en caja).
 * Condición 1: cobro bruto acumulado &lt; capital prestado → descuenta capital + ganancia falsa de inversiones, revierte ganancias y registra pérdida solo del capital.
 * Condición 2: cobro bruto acumulado ≥ capital prestado → corrige ganancias al valor real cobrado.
 */
export function computeRutaCamposTrasPerdidaPrestamo(
  rutaData: Record<string, unknown>,
  saldoPendiente: number,
  montoPrestamo: number,
  totalAPagar: number,
  cobradoAcumulado: number
): RutaUpdatePerdida {
  if (saldoPendiente <= 0) {
    throw new Error("El saldo pendiente debe ser mayor a 0");
  }
  if (montoPrestamo <= 0 || totalAPagar <= 0) {
    throw new Error("Datos del préstamo inválidos");
  }
  if (cobradoAcumulado < 0 || cobradoAcumulado > totalAPagar + 0.01) {
    throw new Error("cobradoAcumulado fuera de rango");
  }

  const cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
  const cajasEmpleados =
    typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
  let inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;
  let ganancias = typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0;
  let perdidas = typeof rutaData.perdidas === "number" ? rutaData.perdidas : 0;

  const gananciaTotal = round2(totalAPagar - montoPrestamo);
  const gananciaAcumulada = snapPesoCOP(
    round2(cobradoAcumulado * (gananciaTotal / totalAPagar))
  );

  if (cobradoAcumulado < montoPrestamo) {
    const capitalNoRecuperado = round2(montoPrestamo - cobradoAcumulado);
    const totalADescontar = round2(capitalNoRecuperado + gananciaAcumulada);
    const inversionesADescontar = Math.min(totalADescontar, inversiones);
    inversiones = round2(inversiones - inversionesADescontar);
    ganancias = round2(ganancias - gananciaAcumulada);
    perdidas = round2(perdidas + capitalNoRecuperado);
  } else {
    const gananciaReal = snapPesoCOP(round2(cobradoAcumulado - montoPrestamo));
    ganancias = snapPesoCOP(round2(ganancias - gananciaAcumulada + gananciaReal));
    if (ganancias < 0) ganancias = 0;
  }

  const nuevoCapitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
  });

  return {
    inversiones,
    ganancias: snapPesoCOP(ganancias),
    perdidas,
    capitalTotal: nuevoCapitalTotal,
  };
}

export type DesembolsoEmpleadoSaldosResult = {
  nuevaCajaEmp: number;
  nuevaCajasEmpleados: number;
  nuevaInversiones: number;
  nuevoCapital: number;
};

/**
 * Saldos tras desembolsar un préstamo desde caja del empleado (cajasEmpleados → inversiones).
 * Sin Firebase — compartido por helper transaccional y tests.
 */
export function computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado(params: {
  cajaEmp: number;
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  monto: number;
  perdidas?: number;
}): DesembolsoEmpleadoSaldosResult {
  const { cajaEmp, cajaRuta, cajasEmpleados, inversiones, monto, perdidas = 0 } = params;

  if (cajaEmp < monto) throw new Error("SALDO_INSUFICIENTE_EMPLEADO");
  if (cajasEmpleados < monto) throw new Error("SALDO_INSUFICIENTE_RUTA");

  const capitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });

  const nuevaCajaEmp = round2(cajaEmp - monto);
  const nuevaCajasEmpleados = round2(cajasEmpleados - monto);
  const nuevaInversiones = round2(inversiones + monto);
  const nuevoCapital = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados: nuevaCajasEmpleados,
    inversiones: nuevaInversiones,
    perdidas,
  });

  if (Math.abs(nuevoCapital - capitalTotal) > 0.02) {
    throw new Error("Capital descuadrado — revisar operación");
  }

  return {
    nuevaCajaEmp,
    nuevaCajasEmpleados,
    nuevaInversiones,
    nuevoCapital,
  };
}
