import type { CobrosDelDiaEmpleadoResponse } from "@/lib/empresa-api";

/**
 * Total cobrado en la ruta + base asignada − gastos − desembolsos desde tu caja (préstamos creados con tu base).
 */
export function tuCajaDelDiaFormula(
  totalCobrosLista: number,
  totalBaseAsignadaDia: number,
  totalGastosDia: number,
  totalPrestamosDesembolsoDia = 0
): number {
  return (
    Math.round(
      (totalCobrosLista +
        totalBaseAsignadaDia -
        totalGastosDia -
        totalPrestamosDesembolsoDia) *
        100
    ) / 100
  );
}

/** Mismos totales que devuelve cobros-del-día. */
export function tuCajaDelDiaDesdeTotales(
  d: Pick<
    CobrosDelDiaEmpleadoResponse,
    | "totalCobrosLista"
    | "totalBaseAsignadaDia"
    | "totalGastosDia"
    | "totalPrestamosDesembolsoDia"
  >
): number {
  return tuCajaDelDiaFormula(
    d.totalCobrosLista,
    d.totalBaseAsignadaDia,
    d.totalGastosDia,
    typeof d.totalPrestamosDesembolsoDia === "number" ? d.totalPrestamosDesembolsoDia : 0
  );
}
