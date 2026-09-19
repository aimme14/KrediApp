"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  collectionGroup,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import {
  fechaDiaColombiaHoy,
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";
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
  const [noPagosHoy, setNoPagosHoy] = useState<{ prestamoId: string }[]>([]);
  const [loadingNoPagos, setLoadingNoPagos] = useState(true);
  const [errorNoPagos, setErrorNoPagos] = useState<string | null>(null);

  const fechaDia = fechaDiaColombiaHoy();
  const isAdmin = Boolean(user && profile && isAdminPanelRole(profile.role));

  useEffect(() => {
    if (!db || !user || !isAdmin || !profile?.empresaId) {
      setNoPagosHoy([]);
      setLoadingNoPagos(false);
      return;
    }

    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) {
      setErrorNoPagos("Fecha inválida");
      setLoadingNoPagos(false);
      return;
    }

    setLoadingNoPagos(true);
    setErrorNoPagos(null);

    const q = query(
      collectionGroup(db, "pagos"),
      where("empresaId", "==", profile.empresaId),
      where("adminId", "==", user.uid),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const ids: { prestamoId: string }[] = [];
        for (const doc of snap.docs) {
          const d = doc.data() as Record<string, unknown>;
          if (d.tipo !== "no_pago" || d.estado === "anulado") continue;
          const prestamoId =
            typeof d.prestamoId === "string"
              ? d.prestamoId
              : doc.ref.parent.parent?.id ?? "";
          if (prestamoId) ids.push({ prestamoId });
        }
        setNoPagosHoy(ids);
        setLoadingNoPagos(false);
      },
      (err) => {
        console.warn("[useAdminRegistrarPagos] noPagos:", err);
        setErrorNoPagos(err.message || "Error al cargar no pagos del día");
        setLoadingNoPagos(false);
      }
    );

    return unsub;
  }, [user?.uid, profile?.empresaId, isAdmin, fechaDia]);

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
    return buildClientesRuta(clientes, prestamos, noPagosHoy);
  }, [isAdmin, clientes, prestamos, noPagosHoy, visitadosBump]);

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

  const loading = isAdmin && (loadingLista || loadingNoPagos);
  const error = errorLista ?? errorNoPagos;

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
