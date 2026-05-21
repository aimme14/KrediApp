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
  doc,
  onSnapshot,
  collection,
  query,
  where,
  collectionGroup,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  fechaDiaColombiaHoy,
  inicioDiaColombiaUtc,
  finDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";
import {
  EMPRESAS_COLLECTION,
  USUARIOS_SUBCOLLECTION,
  ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  getCobrosDelDiaEmpleado,
  type CobrosDelDiaEmpleadoResponse,
} from "@/lib/empresa-api";

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
  const [baseAsignadaRT, setBaseAsignadaRT] = useState<number | null>(null);
  const [cobrosEfectivoRT, setCobrosEfectivoRT] = useState<number | null>(null);
  const [gastosRT, setGastosRT] = useState<number | null>(null);
  const [prestamosRT, setPrestamosRT] = useState<number | null>(null);

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

  useEffect(() => {
    if (!db || !user || profile?.role !== "trabajador") return;
    const empresaId = profile?.empresaId?.trim();
    const rutaId = profile?.rutaId?.trim();
    if (!empresaId) return;

    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) return;

    const q = query(
      collection(
        db,
        EMPRESAS_COLLECTION,
        empresaId,
        USUARIOS_SUBCOLLECTION,
        user.uid,
        ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION
      ),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        let total = 0;
        for (const d of snap.docs) {
          const x = d.data();
          if (rutaId && x.rutaId && x.rutaId !== rutaId) continue;
          const m = typeof x.monto === "number" && x.monto > 0 ? x.monto : 0;
          total += m;
        }
        setBaseAsignadaRT(Math.round(total * 100) / 100);
      },
      (err) => {
        console.warn("[TrabajadorCajaDia] onSnapshot asignacionesBase:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId, profile?.rutaId, fechaDia]);

  useEffect(() => {
    if (!db || !user || profile?.role !== "trabajador") return;
    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) return;

    const q = query(
      collectionGroup(db, "pagos"),
      where("empleadoId", "==", user.uid),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        let efectivo = 0;
        for (const d of snap.docs) {
          const x = d.data();
          if (x.tipo !== "pago") continue;
          const monto = typeof x.monto === "number" ? x.monto : 0;
          if (monto <= 0) continue;
          const metodo = (x.metodoPago ?? "").toLowerCase();
          if (metodo === "efectivo" || metodo.includes("efect")) {
            efectivo += monto;
          }
        }
        setCobrosEfectivoRT(Math.round(efectivo * 100) / 100);
      },
      (err) => {
        console.warn("[TrabajadorCajaDia] onSnapshot pagos:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, fechaDia]);

  useEffect(() => {
    if (!db || !user || profile?.role !== "trabajador") return;
    const empresaId = profile?.empresaId?.trim();
    if (!empresaId) return;
    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) return;

    const q = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, GASTOS_EMPLEADO_SUBCOLLECTION),
      where("empleadoId", "==", user.uid),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        let total = 0;
        for (const d of snap.docs) {
          const m = typeof d.data().monto === "number" ? d.data().monto : 0;
          if (m > 0) total += m;
        }
        setGastosRT(Math.round(total * 100) / 100);
      },
      (err) => {
        console.warn("[TrabajadorCajaDia] onSnapshot gastos:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId, fechaDia]);

  const tuCajaEfectivo = useMemo(() => {
    if (!data) return null;
    const base = baseAsignadaRT ?? data.totalBaseAsignadaDia;
    const cobrosEfectivo = cobrosEfectivoRT ?? data.totalCobrosEfectivoDia;
    const gastos = gastosRT ?? data.totalGastosDia;
    const prestamos = prestamosRT ?? data.totalPrestamosDesembolsoDia ?? 0;
    return Math.round((cobrosEfectivo + base - gastos - prestamos) * 100) / 100;
  }, [data, baseAsignadaRT, cobrosEfectivoRT, gastosRT, prestamosRT]);

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
