/**
 * Efecto contable de un gasto operativo pagado desde la caja del empleado (`cajaEmpleado`).
 * Usado por la API de gastos del trabajador (Admin SDK).
 */

import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { round2 } from "@/lib/ruta-financiera-compute";

export function assertCapitalRutaConsistente(params: {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  perdidas: number;
  capitalTotal: number;
}): void {
  const { cajaRuta, cajasEmpleados, inversiones, perdidas, capitalTotal } = params;
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

/**
 * Descuenta efectivo del empleado y de `cajasEmpleados` de la ruta; recalcula capitalTotal de la ruta.
 */
export function computeCamposTrasGastoOperativoEmpleado(p: {
  monto: number;
  cajaActual: number;
  gastosDelDia: number;
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  perdidas: number;
}): {
  cajaActual: number;
  gastosDelDia: number;
  cajasEmpleados: number;
  capitalTotal: number;
} {
  const m = p.monto;
  if (m <= 0) {
    throw new Error("El monto del gasto debe ser mayor que cero");
  }
  if (p.cajaActual < m) {
    throw new Error("Saldo insuficiente en base del empleado");
  }

  const cajaActual = round2(p.cajaActual - m);
  const gastosDelDia = round2(p.gastosDelDia + m);
  const cajasEmpleados = round2(p.cajasEmpleados - m);
  const capitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta: p.cajaRuta,
    cajasEmpleados,
    inversiones: p.inversiones,
    perdidas: p.perdidas,
  });

  assertCapitalRutaConsistente({
    cajaRuta: p.cajaRuta,
    cajasEmpleados,
    inversiones: p.inversiones,
    perdidas: p.perdidas,
    capitalTotal,
  });

  return { cajaActual, gastosDelDia, cajasEmpleados, capitalTotal };
}
