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
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";

const EMPRESAS_COLLECTION = "empresas";
const PRESTAMOS_SUBCOLLECTION = "prestamos";
const CLIENTES_SUBCOLLECTION = "clientes";

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

  const refresh = useCallback(async () => {
    // Los clientes y préstamos se actualizan via onSnapshot automáticamente
    // refresh se mantiene por compatibilidad pero no hace fetch
  }, []);

  // onSnapshot para clientes
  useEffect(() => {
    if (!db || !user || !profile) return;
    const empresaId = profile.empresaId?.trim();
    if (!empresaId) return;

    const canUse = profile.role === "trabajador" || profile.role === "admin";
    if (!canUse) return;

    setLoading(true);

    const clientesCol = collection(
      db,
      EMPRESAS_COLLECTION,
      empresaId,
      CLIENTES_SUBCOLLECTION
    );

    const q =
      profile.role === "trabajador" && profile.rutaId
        ? query(clientesCol, where("rutaId", "==", profile.rutaId))
        : query(clientesCol, where("adminId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ClienteItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            nombre: data.nombre ?? "",
            ubicacion: data.ubicacion ?? "",
            direccion: data.direccion ?? "",
            telefono: data.telefono ?? "",
            cedula: data.cedula ?? "",
            rutaId: data.rutaId ?? "",
            adminId: data.adminId ?? "",
            prestamo_activo: data.prestamo_activo === true,
            moroso: data.moroso === true,
            fechaCreacion: data.fechaCreacion?.toDate?.()?.toISOString?.() ?? null,
            codigo: data.codigo ?? undefined,
          };
        });
        list.sort((a, b) =>
          (b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0) -
          (a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0)
        );
        setClientes(list);
        setLastFetchedAt(Date.now());
        setLoading(false);
      },
      (err) => {
        console.warn("[TrabajadorLista] onSnapshot clientes:", err);
        setLoading(false);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId, profile?.rutaId]);

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
