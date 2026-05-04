"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { type ClienteItem, type PrestamoItem } from "@/lib/empresa-api";
import type {
  ClienteRuta,
  ClienteRutaGrupo,
  PrioridadClienteRuta,
} from "@/types/finanzas";

export type FiltroRutaDia = "todos" | "mora" | "pendientes" | "cobrados";

const VISITADOS_STORAGE_PREFIX = "krediapp-ruta-visitados-";

/** No refetch al volver a la pestaña si la última carga fue hace menos de esto. */
const VISIBILITY_MIN_INTERVAL_MS = 45_000;

/**
 * Umbral solo para la UI (ruta del día: fila naranja / prioridad 2).
 * No afecta el estado del préstamo en la API.
 */
export const UMBRAL_INTENTOS_ALERTA = 3;

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
  intentosFallidos: number
): PrioridadClienteRuta {
  const hoy = new Date();
  if (estado === "mora") return 1;
  if (
    estado === "activo" &&
    intentosFallidos >= 1 &&
    intentosFallidos < UMBRAL_INTENTOS_ALERTA
  ) {
    return 2;
  }
  if (!fechaVencimiento) return 5;
  const diffMs = fechaVencimiento.getTime() - hoy.getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (dias <= 0) return 3;
  if (dias === 1) return 4;
  return 5;
}

/** Misma prioridad que `clientesFiltrados` para que el 1.er ítem del grupo = préstamo que abre Cobrar */
function compareClienteRutaPrioridad(a: ClienteRuta, b: ClienteRuta): number {
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

function buildClientesRuta(
  clientes: ClienteItem[],
  prestamos: PrestamoItem[]
): ClienteRuta[] {
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
    const intentosFallidos = p.intentosFallidos ?? 0;
    const prioridad = calcularPrioridad(fechaV, estado, intentosFallidos);

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
      moroso: c?.moroso === true,
    });
  }

  return map;
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

  const [filtro, setFiltro] = useState<FiltroRutaDia>("todos");
  /** Invalida memo de visitados tras markVisitado */
  const [visitadosBump, setVisitadosBump] = useState(0);

  const clientesRuta = useMemo(() => {
    if (!user || !profile || profile.role !== "trabajador") return [];
    return buildClientesRuta(clientes, prestamos);
  }, [user, profile, clientes, prestamos, visitadosBump]);

  const loading =
    Boolean(user && profile?.role === "trabajador") && loadingLista;

  const error =
    profile?.role === "trabajador" ? errorLista : null;

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

  const clientesFiltrados = useMemo(() => {
    let lista = [...clientesRuta];
    switch (filtro) {
      case "mora":
        lista = lista.filter((c) => c.estado === "mora");
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

    lista.sort(compareClienteRutaPrioridad);

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
      const sorted = [...items].sort(compareClienteRutaPrioridad);
      const first = sorted[0]!;
      const totalMonto = sorted.reduce((s, i) => s + i.monto, 0);
      const prioridadMax = Math.min(
        ...sorted.map((i) => i.prioridad)
      ) as PrioridadClienteRuta;
      const diasMoraMax = Math.max(...sorted.map((i) => i.diasMora));
      const visitado = sorted.some((i) => i.visitado);

      groups.push({
        clienteId,
        clienteNombre: first.clienteNombre,
        clienteDireccion: first.clienteDireccion,
        zona: first.zona,
        totalMonto,
        cantidadPrestamos: sorted.length,
        prioridadMax,
        diasMoraMax,
        visitado,
        moroso: sorted.some((i) => i.moroso),
        items: sorted,
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
