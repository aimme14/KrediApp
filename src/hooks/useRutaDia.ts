"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { type ClienteItem, type PrestamoItem } from "@/lib/empresa-api";
import { isPrestamoEnCobro } from "@/lib/prestamo-estado";
import {
  calcularDiasVencidos,
  calcularPrioridadCobro,
} from "@/lib/ruta-dia-prioridad";
import type {
  ClienteRuta,
  ClienteRutaGrupo,
  PrioridadClienteRuta,
} from "@/types/finanzas";

export type FiltroRutaDia =
  | "todos"
  | "no_pago_hoy"
  | "pendientes"
  | "cobrados"
  | "morosos";

export const FILTROS_RUTA_DIA: { id: FiltroRutaDia; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "no_pago_hoy", label: "No pagaron hoy" },
  { id: "pendientes", label: "Pendientes" },
  { id: "cobrados", label: "Cobrados" },
  { id: "morosos", label: "Morosos" },
];

const VISITADOS_STORAGE_PREFIX = "krediapp-ruta-visitados-";

/** No refetch al volver a la pestaña si la última carga fue hace menos de esto. */
const VISIBILITY_MIN_INTERVAL_MS = 45_000;

/** Re-export para compatibilidad con componentes que importan desde este hook. */
export { UMBRAL_INTENTOS_ALERTA } from "@/lib/ruta-dia-prioridad";

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
  busquedaNombre: string;
  setBusquedaNombre: (value: string) => void;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Marca cliente como visitado hoy y actualiza estado local */
  markVisitado: (clienteId: string) => void;
}

/** Misma prioridad que `clientesFiltrados` para que el 1.er ítem del grupo = préstamo que abre Cobrar */
function compareClienteRutaPrioridad(a: ClienteRuta, b: ClienteRuta): number {
  if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
  const zonaA = (a.zona ?? "").toLowerCase();
  const zonaB = (b.zona ?? "").toLowerCase();
  if (zonaA && zonaB && zonaA !== zonaB) {
    return zonaA.localeCompare(zonaB);
  }
  if (b.diasVencidos !== a.diasVencidos) return b.diasVencidos - a.diasVencidos;
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

/** Convierte fecha de API (ISO / YYYY-MM-DD) a Date | null */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const local = new Date(y, m - 1, d);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildClientesRuta(
  clientes: ClienteItem[],
  prestamos: PrestamoItem[],
  noPagosHoy: { prestamoId: string }[]
): ClienteRuta[] {
  const prestamosPendientes = prestamos.filter((p) => isPrestamoEnCobro(p));
  const mapClientesById = new Map(clientes.map((c) => [c.id, c]));
  const visitados = getVisitadosHoy();
  const noPagoHoySet = new Set(noPagosHoy.map((n) => n.prestamoId));

  const map: ClienteRuta[] = [];
  for (const p of prestamosPendientes) {
    const c = mapClientesById.get(p.clienteId);
    const fechaV = toDate(p.fechaFinal ?? p.fechaVencimiento ?? null);
    const intentosFallidos = p.intentosFallidos ?? 0;
    const diasVencidos = calcularDiasVencidos(fechaV);
    const prioridad = calcularPrioridadCobro(fechaV, intentosFallidos);

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
      estado: p.estado ?? "activo",
      frecuencia: p.modalidad ?? "",
      numeroCuota: 1,
      totalCuotas: p.numeroCuotas ?? 0,
      diasVencidos,
      intentosFallidos,
      prioridad,
      visitado: visitados.has(p.clienteId),
      cuotaPagadaHoy,
      noPagoHoy: noPagoHoySet.has(p.id),
      moroso: p.moroso === true || c?.moroso === true,
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
  const { data: cajaDia } = useTrabajadorCajaDia();

  const [filtro, setFiltro] = useState<FiltroRutaDia>("pendientes");
  const [busquedaNombre, setBusquedaNombre] = useState("");
  /** Invalida memo de visitados tras markVisitado */
  const [visitadosBump, setVisitadosBump] = useState(0);

  const clientesRuta = useMemo(() => {
    if (!user || !profile || profile.role !== "trabajador") return [];
    return buildClientesRuta(clientes, prestamos, cajaDia?.noPagos ?? []);
  }, [user, profile, clientes, prestamos, visitadosBump, cajaDia?.noPagos]);

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
      case "no_pago_hoy":
        lista = lista.filter((c) => c.noPagoHoy);
        break;
      case "pendientes":
        lista = lista.filter((c) => !c.cuotaPagadaHoy && !c.noPagoHoy);
        break;
      case "cobrados":
        lista = lista.filter((c) => c.cuotaPagadaHoy);
        break;
      case "morosos":
        lista = lista.filter((c) => c.moroso);
        break;
      case "todos":
      default:
        break;
    }

    const q = busquedaNombre.trim().toLowerCase();
    if (q) {
      lista = lista.filter((c) =>
        c.clienteNombre.toLowerCase().includes(q)
      );
    }

    lista.sort(compareClienteRutaPrioridad);

    return lista;
  }, [clientesRuta, filtro, busquedaNombre]);

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
      const diasVencidosMax = Math.max(...sorted.map((i) => i.diasVencidos));
      const visitado = sorted.some((i) => i.visitado);

      groups.push({
        clienteId,
        clienteNombre: first.clienteNombre,
        clienteDireccion: first.clienteDireccion,
        zona: first.zona,
        totalMonto,
        cantidadPrestamos: sorted.length,
        prioridadMax,
        diasVencidosMax,
        visitado,
        moroso: sorted.some((i) => i.moroso),
        items: sorted,
      });
    });

    groups.sort((a, b) => {
      if (a.prioridadMax !== b.prioridadMax)
        return a.prioridadMax - b.prioridadMax;
      if (b.diasVencidosMax !== a.diasVencidosMax)
        return b.diasVencidosMax - a.diasVencidosMax;
      return b.totalMonto - a.totalMonto;
    });

    return groups;
  }, [clientesFiltrados]);

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
