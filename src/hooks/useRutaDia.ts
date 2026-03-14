"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listClientes,
  listPrestamos,
  type PrestamoItem,
} from "@/lib/empresa-api";
import type {
  ClienteRuta,
  ClienteRutaGrupo,
  PrioridadClienteRuta,
} from "@/types/finanzas";

export type FiltroRutaDia =
  | "todos"
  | "mora"
  | "hoy"
  | "pendientes"
  | "cobrados";

const VISITADOS_STORAGE_PREFIX = "krediapp-ruta-visitados-";

function getVisitadosKey(): string {
  return `${VISITADOS_STORAGE_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

/** Lee los clienteIds ya visitados hoy desde localStorage */
export function getVisitadosHoy(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(getVisitadosKey());
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Marca un cliente como visitado hoy en localStorage */
export function addVisitadoHoy(clienteId: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = getVisitadosKey();
    const set = new Set(getVisitadosHoy());
    set.add(clienteId);
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

interface UseRutaDiaState {
  clientes: ClienteRuta[];
  clientesFiltrados: ClienteRuta[];
  /** Agrupados por cliente para mostrar una fila por cliente */
  clientesFiltradosGrouped: ClienteRutaGrupo[];
  filtro: FiltroRutaDia;
  setFiltro: (f: FiltroRutaDia) => void;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Marca cliente como visitado hoy y actualiza estado local */
  markVisitado: (clienteId: string) => void;
}

function calcularDiasMora(
  fechaVencimiento: Date | null,
  estado: string
): number {
  if (!fechaVencimiento) return 0;
  const hoy = new Date();
  const diffMs = hoy.getTime() - fechaVencimiento.getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return estado === "mora" && dias > 0 ? dias : 0;
}

function calcularPrioridad(
  fechaVencimiento: Date | null,
  estado: string,
  diasMora: number
): PrioridadClienteRuta {
  const hoy = new Date();
  if (estado === "mora" && diasMora > 0) return 1;
  if (!fechaVencimiento) return 4;
  const diffMs = fechaVencimiento.getTime() - hoy.getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (dias <= 0) return 2; // vence hoy o vencido
  if (dias === 1) return 3; // mañana
  if (dias <= 7) return 4; // esta semana
  return 4;
}

function isHoy(fecha: Date | null): boolean {
  if (!fecha) return false;
  const hoy = new Date();
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
}

/** True si la fecha ISO corresponde al día actual (local). Para semáforo "cuota del día pagada". */
function isMismoDia(isoDate: string | null | undefined): boolean {
  if (!isoDate || typeof isoDate !== "string") return false;
  const d = toDate(isoDate);
  return isHoy(d);
}

/** Convierte fecha de API (ISO string o null) a Date | null */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function useRutaDia(): UseRutaDiaState {
  const { user, profile } = useAuth();
  const [clientesRuta, setClientesRuta] = useState<ClienteRuta[]>([]);
  const [filtro, setFiltro] = useState<FiltroRutaDia>("todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const load = useCallback(async () => {
    if (!user || !profile || profile.role !== "trabajador") {
      setClientesRuta([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [clientes, prestamos] = await Promise.all([
        listClientes(token),
        listPrestamos(token),
      ]);

      const prestamosPendientes = prestamos.filter(
        (p) => p.estado !== "pagado" && (p.saldoPendiente ?? 0) > 0
      );
      const mapClientesById = new Map(clientes.map((c) => [c.id, c]));
      const visitados = getVisitadosHoy();

      const map: ClienteRuta[] = [];
      for (const p of prestamosPendientes) {
        const c = mapClientesById.get(p.clienteId);
        const fechaV = toDate(p.fechaVencimiento ?? null);
        const estado = p.estado ?? "activo";
        const diasMora = calcularDiasMora(fechaV, estado);
        const prioridad = calcularPrioridad(fechaV, estado, diasMora);
        const intentosFallidos =
          (p as PrestamoItem & { intentosFallidos?: number }).intentosFallidos ??
          0;

        const cuotaPagadaHoy = isMismoDia(p.ultimoPagoFecha ?? null);

        map.push({
          cuotaId: p.id,
          prestamoId: p.id,
          clienteId: p.clienteId,
          clienteNombre: c?.nombre ?? `Cliente ${p.clienteId.slice(0, 8)}`,
          clienteDireccion: c?.direccion ?? "",
          zona: c?.ubicacion ?? "",
          monto: p.saldoPendiente ?? 0,
          fechaVencimiento: fechaV,
          estado,
          frecuencia: p.modalidad ?? "",
          numeroCuota: 1,
          totalCuotas: p.numeroCuotas ?? 0,
          diasMora,
          intentosFallidos,
          prioridad,
          visitado: visitados.has(p.clienteId),
          cuotaPagadaHoy,
        });
      }

      setClientesRuta(map);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al cargar la ruta del día";
      setError(msg);
      setClientesRuta([]);
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setRefreshTrigger((t) => t + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const refetch = useCallback(() => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  const markVisitado = useCallback((clienteId: string) => {
    addVisitadoHoy(clienteId);
    setClientesRuta((prev) =>
      prev.map((c) =>
        c.clienteId === clienteId ? { ...c, visitado: true } : c
      )
    );
  }, []);

  const clientesFiltrados = useMemo(() => {
    let lista = [...clientesRuta];
    switch (filtro) {
      case "mora":
        lista = lista.filter((c) => c.estado === "mora");
        break;
      case "hoy":
        lista = lista.filter((c) => isHoy(c.fechaVencimiento));
        break;
      case "pendientes":
        lista = lista.filter((c) => !c.cuotaPagadaHoy);
        break;
      case "cobrados":
        lista = lista.filter((c) => c.cuotaPagadaHoy);
        break;
      case "todos":
      default:
        break;
    }

    lista.sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
      const zonaA = (a.zona ?? "").toLowerCase();
      const zonaB = (b.zona ?? "").toLowerCase();
      if (zonaA && zonaB && zonaA !== zonaB) {
        return zonaA.localeCompare(zonaB);
      }
      if (b.diasMora !== a.diasMora) return b.diasMora - a.diasMora;
      if (b.intentosFallidos !== a.intentosFallidos)
        return b.intentosFallidos - a.intentosFallidos;
      return b.monto - a.monto;
    });

    return lista;
  }, [clientesRuta, filtro]);

  const clientesFiltradosGrouped = useMemo((): ClienteRutaGrupo[] => {
    const byClient = new Map<string, ClienteRuta[]>();
    for (const item of clientesFiltrados) {
      const list = byClient.get(item.clienteId) ?? [];
      list.push(item);
      byClient.set(item.clienteId, list);
    }

    const groups: ClienteRutaGrupo[] = [];
    byClient.forEach((items, clienteId) => {
      const first = items[0]!;
      const totalMonto = items.reduce((s, i) => s + i.monto, 0);
      const prioridadMax = Math.min(
        ...items.map((i) => i.prioridad)
      ) as PrioridadClienteRuta;
      const diasMoraMax = Math.max(...items.map((i) => i.diasMora));
      const visitado = items.some((i) => i.visitado);

      groups.push({
        clienteId,
        clienteNombre: first.clienteNombre,
        clienteDireccion: first.clienteDireccion,
        zona: first.zona,
        totalMonto,
        cantidadPrestamos: items.length,
        prioridadMax,
        diasMoraMax,
        visitado,
        items,
      });
    });

    groups.sort((a, b) => {
      if (a.prioridadMax !== b.prioridadMax)
        return a.prioridadMax - b.prioridadMax;
      if (b.diasMoraMax !== a.diasMoraMax)
        return b.diasMoraMax - a.diasMoraMax;
      return b.totalMonto - a.totalMonto;
    });

    return groups;
  }, [clientesFiltrados]);

  return {
    clientes: clientesRuta,
    filtro,
    setFiltro,
    clientesFiltrados,
    clientesFiltradosGrouped,
    loading,
    error,
    refetch,
    markVisitado,
  };
}
