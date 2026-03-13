"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listClientes,
  listPrestamos,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import type { ClienteRuta, PrioridadClienteRuta } from "@/types/finanzas";

export type FiltroRutaDia = "todos" | "mora" | "hoy" | "pendientes" | "cobrados";

interface UseRutaDiaState {
  clientes: ClienteRuta[];
  filtro: FiltroRutaDia;
  setFiltro: (f: FiltroRutaDia) => void;
  clientesFiltrados: ClienteRuta[];
  loading: boolean;
}

function calcularDiasMora(fechaVencimiento: Date | null, estado: string): number {
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

export function useRutaDia(): UseRutaDiaState {
  const { user, profile } = useAuth();
  const [clientesRuta, setClientesRuta] = useState<ClienteRuta[]>([]);
  const [filtro, setFiltro] = useState<FiltroRutaDia>("todos");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile || profile.role !== "trabajador") {
      setClientesRuta([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
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

        const map: ClienteRuta[] = [];
        for (const p of prestamosPendientes) {
          const c = mapClientesById.get(p.clienteId);
          const fechaV = p.fechaVencimiento ? new Date(p.fechaVencimiento) : null;
          const estado = p.estado ?? "activo";
          const diasMora = calcularDiasMora(fechaV, estado);
          const prioridad = calcularPrioridad(fechaV, estado, diasMora);

          map.push({
            cuotaId: p.id,
            prestamoId: p.id,
            clienteId: p.clienteId,
            clienteNombre: c?.nombre ?? `Cliente ${p.clienteId.slice(0, 8)}`,
            clienteDireccion: c?.direccion ?? "",
            zona: c?.ubicacion || c?.base || "",
            monto: p.saldoPendiente ?? 0,
            fechaVencimiento: fechaV as any,
            estado,
            frecuencia: p.modalidad ?? "",
            numeroCuota: 1,
            totalCuotas: p.numeroCuotas ?? 0,
            diasMora,
            intentosFallidos: 0,
            prioridad,
            visitado: false,
          });
        }

        setClientesRuta(map);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, profile]);

  const clientesFiltrados = useMemo(() => {
    const hoy = new Date();
    const isHoy = (d: Date | null) =>
      !!d &&
      d.getFullYear() === hoy.getFullYear() &&
      d.getMonth() === hoy.getMonth() &&
      d.getDate() === hoy.getDate();

    let lista = [...clientesRuta];
    switch (filtro) {
      case "mora":
        lista = lista.filter((c) => c.estado === "mora");
        break;
      case "hoy":
        lista = lista.filter((c) => isHoy(c.fechaVencimiento as any));
        break;
      case "pendientes":
        lista = lista.filter((c) => c.estado !== "pagada");
        break;
      case "cobrados":
        lista = lista.filter((c) => c.estado === "pagada");
        break;
      case "todos":
      default:
        break;
    }

    // Orden por:
    // 1) Prioridad (1..4)
    // 2) Zona (clientes de la misma zona primero, orden alfabético)
    // 3) Días de mora DESC
    // 4) Intentos fallidos DESC
    // 5) Monto DESC
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

  return {
    clientes: clientesRuta,
    filtro,
    setFiltro,
    clientesFiltrados,
    loading,
  };
}

