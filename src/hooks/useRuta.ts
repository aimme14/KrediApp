"use client";

import { useTrabajadorRuta } from "@/context/TrabajadorRutaContext";
import type { RutaFinanciera } from "@/types/finanzas";

interface UseRutaState {
  ruta: RutaFinanciera | null;
  loading: boolean;
  error: string | null;
}

/**
 * Suscripción en tiempo real a la ruta del trabajador (una sola vía {@link TrabajadorRutaProvider}).
 */
export function useRuta(): UseRutaState {
  const v = useTrabajadorRuta();
  return { ruta: v.ruta, loading: v.loading, error: v.error };
}
