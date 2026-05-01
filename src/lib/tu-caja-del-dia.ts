import type { CobrosDelDiaEmpleadoResponse } from "@/lib/empresa-api";

/** Cobros en la ruta + base asignada − gastos (mismos totales que devuelve cobros-del-día). */
export function tuCajaDelDiaDesdeTotales(
  d: Pick<
    CobrosDelDiaEmpleadoResponse,
    "totalCobrosLista" | "totalBaseAsignadaDia" | "totalGastosDia"
  >
): number {
  return (
    Math.round((d.totalCobrosLista + d.totalBaseAsignadaDia - d.totalGastosDia) * 100) /
    100
  );
}
