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
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import {
  getCobrosDelDiaEmpleado,
  type CobrosDelDiaEmpleadoResponse,
} from "@/lib/empresa-api";
import { tuCajaEfectivoFormula } from "@/lib/tu-caja-del-dia";

const EMPRESAS_COLLECTION = "empresas";
const USUARIOS_SUBCOLLECTION = "usuarios";

export type TrabajadorCajaDiaContextValue = {
  fechaDia: string;
  data: CobrosDelDiaEmpleadoResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  cajaEmpleadoRT: number | null;
  tuCajaEfectivo: number | null;
};

const TrabajadorCajaDiaContext = createContext<TrabajadorCajaDiaContextValue | null>(null);

export function TrabajadorCajaDiaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [fechaDia] = useState(() => fechaDiaColombiaHoy());
  const [data, setData] = useState<CobrosDelDiaEmpleadoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cajaEmpleadoRT, setCajaEmpleadoRT] = useState<number | null>(null);

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

  useEffect(() => {
    if (!db || !user || profile?.role !== "trabajador") return;
    const empresaId = profile?.empresaId?.trim();
    if (!empresaId) return;

    const ref = doc(
      db,
      EMPRESAS_COLLECTION,
      empresaId,
      USUARIOS_SUBCOLLECTION,
      user.uid
    );

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const caja = snap.data()?.cajaEmpleado;
        setCajaEmpleadoRT(typeof caja === "number" ? caja : null);
      },
      (err) => {
        console.warn("[TrabajadorCajaDia] onSnapshot cajaEmpleado:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId]);

  const tuCajaEfectivo = data
    ? tuCajaEfectivoFormula(
        data.totalCobrosEfectivoDia,
        data.totalBaseAsignadaDia,
        data.totalGastosDia,
        data.totalPrestamosDesembolsoDia ?? 0
      )
    : null;

  const value = useMemo(
    (): TrabajadorCajaDiaContextValue => ({
      fechaDia,
      data,
      loading,
      error,
      refresh,
      cajaEmpleadoRT,
      tuCajaEfectivo,
    }),
    [fechaDia, data, loading, error, refresh, cajaEmpleadoRT, tuCajaEfectivo]
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
