"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import {
  getCobrosDelDiaEmpleado,
  type CobrosDelDiaEmpleadoResponse,
} from "@/lib/empresa-api";

export type TrabajadorCajaDiaContextValue = {
  /** Día consultado (Colombia, yyyy-mm-dd). */
  fechaDia: string;
  data: CobrosDelDiaEmpleadoResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const TrabajadorCajaDiaContext = createContext<TrabajadorCajaDiaContextValue | null>(
  null
);

export function TrabajadorCajaDiaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [fechaDia] = useState(() => fechaDiaColombiaHoy());
  const [data, setData] = useState<CobrosDelDiaEmpleadoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || profile?.role !== "trabajador") {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await getCobrosDelDiaEmpleado(token, fechaDia);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, profile?.role, fechaDia]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    (): TrabajadorCajaDiaContextValue => ({
      fechaDia,
      data,
      loading,
      error,
      refresh,
    }),
    [fechaDia, data, loading, error, refresh]
  );

  return (
    <TrabajadorCajaDiaContext.Provider value={value}>
      {children}
    </TrabajadorCajaDiaContext.Provider>
  );
}

export function useTrabajadorCajaDia(): TrabajadorCajaDiaContextValue {
  const ctx = useContext(TrabajadorCajaDiaContext);
  if (!ctx) {
    throw new Error("useTrabajadorCajaDia debe usarse dentro de TrabajadorCajaDiaProvider");
  }
  return ctx;
}
