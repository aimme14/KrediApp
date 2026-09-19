"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { useMarcadoresPagosDiaHoy } from "@/hooks/useMarcadoresPagosDiaHoy";
import {
  addVisitadoHoy,
  agruparClientesRuta,
  buildClientesRuta,
  filtrarClientesRuta,
  type FiltroRutaDia,
} from "@/lib/ruta-dia-build";
import type { ClienteRuta, ClienteRutaGrupo } from "@/types/finanzas";

export type { FiltroRutaDia } from "@/lib/ruta-dia-build";

export const FILTROS_RUTA_DIA: { id: FiltroRutaDia; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pasa_mas_tarde", label: "Pasa más tarde" },
  { id: "no_pago_hoy", label: "No pagaron hoy" },
  { id: "pendientes", label: "Pendientes" },
  { id: "cobrados", label: "Cobrados" },
  { id: "morosos", label: "Morosos" },
];

/** No refetch al volver a la pestaña si la última carga fue hace menos de esto. */
const VISIBILITY_MIN_INTERVAL_MS = 45_000;

/** Re-export para compatibilidad con componentes que importan desde este hook. */
export { UMBRAL_INTENTOS_ALERTA } from "@/lib/ruta-dia-prioridad";
export { addVisitadoHoy, getVisitadosHoy } from "@/lib/ruta-dia-build";

interface UseRutaDiaState {
  clientes: ClienteRuta[];
  clientesFiltrados: ClienteRuta[];
  /** Agrupados por cliente para mostrar una fila por cliente */
  clientesFiltradosGrouped: ClienteRutaGrupo[];
  filtro: FiltroRutaDia;
  setFiltro: (f: FiltroRutaDia) => void;
  busquedaNombre: string;
  setBusquedaNombre: (value: string) => void;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Marca cliente como visitado hoy y actualiza estado local */
  markVisitado: (clienteId: string) => void;
}

export function useRutaDia(): UseRutaDiaState {
  const { user, profile } = useAuth();
  const {
    clientes,
    prestamos,
    loading: loadingLista,
    error: errorLista,
    lastFetchedAt,
    refresh,
  } = useTrabajadorLista();

  const marcadoresScope = useMemo(() => {
    if (profile?.role !== "trabajador") return undefined;
    const rutaId = profile.rutaId?.trim();
    if (!rutaId) return undefined;
    return { kind: "empleado_ruta" as const, rutaId };
  }, [profile?.role, profile?.rutaId]);
  const {
    marcadores,
    loading: loadingMarcadores,
    error: errorMarcadores,
  } = useMarcadoresPagosDiaHoy(
    Boolean(user && profile?.role === "trabajador"),
    profile?.empresaId,
    marcadoresScope
  );

  const [filtro, setFiltro] = useState<FiltroRutaDia>("pendientes");
  const [busquedaNombre, setBusquedaNombre] = useState("");
  /** Invalida memo de visitados tras markVisitado */
  const [visitadosBump, setVisitadosBump] = useState(0);

  const clientesRuta = useMemo(() => {
    if (!user || !profile || profile.role !== "trabajador") return [];
    return buildClientesRuta(clientes, prestamos, marcadores);
  }, [user, profile, clientes, prestamos, visitadosBump, marcadores]);

  const loading =
    Boolean(user && profile?.role === "trabajador") &&
    (loadingLista || loadingMarcadores);

  const error =
    profile?.role === "trabajador" ? errorLista ?? errorMarcadores : null;

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (lastFetchedAt === 0) return;
      const age = Date.now() - lastFetchedAt;
      if (age < VISIBILITY_MIN_INTERVAL_MS) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh, lastFetchedAt]);

  const refetch = useCallback(() => {
    void refresh();
  }, [refresh]);

  const markVisitado = useCallback((clienteId: string) => {
    addVisitadoHoy(clienteId);
    setVisitadosBump((b) => b + 1);
  }, []);

  const clientesFiltrados = useMemo(
    () => filtrarClientesRuta(clientesRuta, filtro, busquedaNombre),
    [clientesRuta, filtro, busquedaNombre]
  );

  const clientesFiltradosGrouped = useMemo(
    () => agruparClientesRuta(clientesFiltrados),
    [clientesFiltrados]
  );

  return {
    clientes: clientesRuta,
    filtro,
    setFiltro,
    busquedaNombre,
    setBusquedaNombre,
    clientesFiltrados,
    clientesFiltradosGrouped,
    loading,
    error,
    refetch,
    markVisitado,
  };
}
