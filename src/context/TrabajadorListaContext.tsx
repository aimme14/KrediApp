"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listClientes,
  listPrestamos,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";

export type TrabajadorListaContextValue = {
  clientes: ClienteItem[];
  prestamos: PrestamoItem[];
  /** True solo en la primera carga sin datos previos (evita parpadeo en refrescos). */
  loading: boolean;
  error: string | null;
  /** Timestamp ms de la última carga exitosa (para debounce de refetch). */
  lastFetchedAt: number;
  refresh: () => Promise<void>;
};

const TrabajadorListaContext = createContext<TrabajadorListaContextValue | null>(
  null
);

export function TrabajadorListaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const hasLoadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || !profile || profile.role !== "trabajador") {
      setClientes([]);
      setPrestamos([]);
      setError(null);
      setLastFetchedAt(0);
      hasLoadedOnce.current = false;
      return;
    }

    const initial = !hasLoadedOnce.current;
    if (initial) setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [c, p] = await Promise.all([
        listClientes(token),
        listPrestamos(token),
      ]);
      setClientes(c);
      setPrestamos(p);
      setLastFetchedAt(Date.now());
      hasLoadedOnce.current = true;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al cargar datos de la empresa";
      setError(msg);
      if (!hasLoadedOnce.current) {
        setClientes([]);
        setPrestamos([]);
      }
    } finally {
      if (initial) setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    (): TrabajadorListaContextValue => ({
      clientes,
      prestamos,
      loading,
      error,
      lastFetchedAt,
      refresh,
    }),
    [clientes, prestamos, loading, error, lastFetchedAt, refresh]
  );

  return (
    <TrabajadorListaContext.Provider value={value}>
      {children}
    </TrabajadorListaContext.Provider>
  );
}

export function useTrabajadorLista(): TrabajadorListaContextValue {
  const ctx = useContext(TrabajadorListaContext);
  if (!ctx) {
    throw new Error(
      "useTrabajadorLista debe usarse dentro de TrabajadorListaProvider"
    );
  }
  return ctx;
}
