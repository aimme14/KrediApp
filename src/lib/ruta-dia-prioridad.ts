import type { PrioridadClienteRuta } from "@/types/finanzas";

/**
 * Umbral para alerta alta en ruta del día (semáforo rojo / prioridad 1).
 * No cambia el estado del préstamo en servidor.
 */
export const UMBRAL_INTENTOS_ALERTA = 3;

export function calcularDiasVencidos(fechaVencimiento: Date | null): number {
  if (!fechaVencimiento) return 0;
  const hoy = new Date();
  const diffMs = hoy.getTime() - fechaVencimiento.getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : 0;
}

export function calcularPrioridadCobro(
  fechaVencimiento: Date | null,
  intentosFallidos: number
): PrioridadClienteRuta {
  if (intentosFallidos >= UMBRAL_INTENTOS_ALERTA) return 1;
  if (intentosFallidos >= 1 && intentosFallidos < UMBRAL_INTENTOS_ALERTA) return 2;
  if (!fechaVencimiento) return 5;
  const hoy = new Date();
  const diffMs = fechaVencimiento.getTime() - hoy.getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (dias <= 0) return 3;
  if (dias === 1) return 4;
  return 5;
}

export function tieneAlertaAlta(intentosFallidos: number): boolean {
  return intentosFallidos >= UMBRAL_INTENTOS_ALERTA;
}

export function tieneAlertaNoPagoInformativa(intentosFallidos: number): boolean {
  return intentosFallidos >= 1 && intentosFallidos < UMBRAL_INTENTOS_ALERTA;
}
