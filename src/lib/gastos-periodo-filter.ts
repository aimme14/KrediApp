import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
} from "@/lib/colombia-day-bounds";

export type GastosPeriodoVista = "hoy" | "historial";

/** Gasto con fecha ISO (o null) registrada en Firestore. */
export type GastoConFecha = { fecha?: string | null };

/** True si el gasto pertenece al día calendario actual en Colombia. */
export function esGastoDelDiaColombia(
  fechaIso: string | null | undefined,
  hoy: string = fechaDiaColombiaHoy()
): boolean {
  const dia = fechaDiaCalendarioDesdeISO(fechaIso);
  return dia !== null && dia === hoy;
}

/** Separa gastos del día actual (Bogotá) del resto del historial. */
export function filtrarGastosPorPeriodo<T extends GastoConFecha>(
  gastos: T[],
  vista: GastosPeriodoVista,
  hoy: string = fechaDiaColombiaHoy()
): T[] {
  if (vista === "hoy") {
    return gastos.filter((g) => esGastoDelDiaColombia(g.fecha, hoy));
  }
  return gastos.filter((g) => !esGastoDelDiaColombia(g.fecha, hoy));
}
