"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import { useMarcadoresPagosDiaHoy } from "@/hooks/useMarcadoresPagosDiaHoy";
import {
  addVisitadoHoy,
  agruparClientesRuta,
  buildClientesRuta,
  filtrarClientesRuta,
  type FiltroRutaDia,
} from "@/lib/ruta-dia-build";
import type { ClienteRuta, ClienteRutaGrupo } from "@/types/finanzas";

const VISIBILITY_MIN_INTERVAL_MS = 45_000;

export function useAdminRegistrarPagos() {
  const { user, profile } = useAuth();
  const {
    clientes,
    prestamos,
    loading: loadingLista,
    error: errorLista,
    lastFetchedAt,
    refresh,
  } = useTrabajadorLista();

  const [filtro, setFiltro] = useState<FiltroRutaDia>("pendientes");
  const [busquedaNombre, setBusquedaNombre] = useState("");
  const [filtroRutaId, setFiltroRutaId] = useState("");
  const [visitadosBump, setVisitadosBump] = useState(0);

  const isAdmin = Boolean(user && profile && isAdminPanelRole(profile.role));
  const marcadoresScope = useMemo(
    () =>
      user?.uid && isAdmin ? ({ kind: "admin" as const, adminUid: user.uid }) : undefined,
    [user?.uid, isAdmin]
  );
  const {
    marcadores,
    loading: loadingMarcadores,
    error: errorMarcadores,
    fechaDia,
  } = useMarcadoresPagosDiaHoy(isAdmin, profile?.empresaId, marcadoresScope);

  const rutaIdPorClienteId = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.rutaId ?? ""])),
    [clientes]
  );

  const rutaIdPorPrestamoId = useMemo(
    () => new Map(prestamos.map((p) => [p.id, p.rutaId ?? ""])),
    [prestamos]
  );

  const clientesRuta = useMemo(() => {
    if (!isAdmin) return [];
    return buildClientesRuta(clientes, prestamos, marcadores);
  }, [isAdmin, clientes, prestamos, marcadores, visitadosBump]);

  const clientesFiltrados = useMemo(
    () =>
      filtrarClientesRuta(clientesRuta, filtro, busquedaNombre, {
        rutaId: filtroRutaId,
        rutaIdPorClienteId,
        rutaIdPorPrestamoId,
      }),
    [
      clientesRuta,
      filtro,
      busquedaNombre,
      filtroRutaId,
      rutaIdPorClienteId,
      rutaIdPorPrestamoId,
    ]
  );

  const clientesFiltradosGrouped = useMemo(
    () => agruparClientesRuta(clientesFiltrados),
    [clientesFiltrados]
  );

  const loading = isAdmin && (loadingLista || loadingMarcadores);
  const error = errorLista ?? errorMarcadores;

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

  const conteos = useMemo(
    () => ({
      cobrados: clientesRuta.filter((c) => c.cuotaPagadaHoy).length,
      noPagoHoy: clientesRuta.filter((c) => c.noPagoHoy).length,
      pendientes: clientesRuta.filter((c) => !c.cuotaPagadaHoy && !c.noPagoHoy).length,
      morosos: clientesRuta.filter((c) => c.moroso).length,
    }),
    [clientesRuta]
  );

  return {
    clientes: clientesRuta,
    clientesFiltrados,
    clientesFiltradosGrouped,
    filtro,
    setFiltro,
    busquedaNombre,
    setBusquedaNombre,
    filtroRutaId,
    setFiltroRutaId,
    loading,
    error,
    refetch,
    markVisitado,
    conteos,
    fechaDia,
  };
}
