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
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  listClientes,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";

const EMPRESAS_COLLECTION = "empresas";
const PRESTAMOS_SUBCOLLECTION = "prestamos";

export type TrabajadorListaContextValue = {
  clientes: ClienteItem[];
  prestamos: PrestamoItem[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number;
  refresh: () => Promise<void>;
};

const TrabajadorListaContext = createContext<TrabajadorListaContextValue | null>(null);

export function TrabajadorListaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const hasLoadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    const canUse =
      !!user && !!profile && (profile.role === "trabajador" || profile.role === "admin");
    if (!canUse) {
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
      const c = await listClientes(token);
      setClientes(c);
      setLastFetchedAt(Date.now());
      hasLoadedOnce.current = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar clientes";
      setError(msg);
      if (!hasLoadedOnce.current) setClientes([]);
    } finally {
      if (initial) setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!db || !user || !profile) return;
    const empresaId = profile.empresaId?.trim();
    if (!empresaId) return;

    const canUse = profile.role === "trabajador" || profile.role === "admin";
    if (!canUse) return;

    const prestamosCol = collection(
      db,
      EMPRESAS_COLLECTION,
      empresaId,
      PRESTAMOS_SUBCOLLECTION
    );

    const q =
      profile.role === "trabajador" && profile.rutaId
        ? query(prestamosCol, where("rutaId", "==", profile.rutaId))
        : query(prestamosCol, where("adminId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PrestamoItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            clienteId: data.clienteId ?? "",
            rutaId: data.rutaId ?? "",
            adminId: data.adminId ?? "",
            empleadoId: data.empleadoId ?? "",
            monto: data.monto ?? 0,
            interes: data.interes ?? 0,
            modalidad: data.modalidad ?? "mensual",
            numeroCuotas: data.numeroCuotas ?? 0,
            totalAPagar: data.totalAPagar ?? 0,
            saldoPendiente: data.saldoPendiente ?? 0,
            estado: data.estado ?? "activo",
            fechaInicio: data.fechaInicio?.toDate?.()?.toISOString?.() ?? null,
            fechaVencimiento: data.fechaVencimiento?.toDate?.()?.toISOString?.() ?? null,
            multaMora: data.multaMora ?? 0,
            adelantoCuota: data.adelantoCuota ?? 0,
            ultimoPagoFecha: data.ultimoPagoFecha?.toDate?.()?.toISOString?.() ?? null,
            intentosFallidos:
              typeof data.intentosFallidos === "number" ? data.intentosFallidos : 0,
          };
        });
        setPrestamos(list);
      },
      (err) => {
        console.warn("[TrabajadorLista] onSnapshot préstamos:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId, profile?.rutaId]);

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
    throw new Error("useTrabajadorLista debe usarse dentro de TrabajadorListaProvider");
  }
  return ctx;
}
