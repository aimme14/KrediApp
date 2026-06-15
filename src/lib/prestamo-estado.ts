import type { EstadoPrestamo } from "@/types/firestore";

export const ESTADO_PRESTAMO_ABIERTO = "activo" as const;

/** Normaliza el estado del préstamo al leer desde Firestore. */
export function normalizeEstadoPrestamo(estado: unknown): EstadoPrestamo {
  if (estado === "pagado") return "pagado";
  return ESTADO_PRESTAMO_ABIERTO;
}
