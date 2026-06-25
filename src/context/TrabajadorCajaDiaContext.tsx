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
  GASTOS_EMPLEADO_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  getCobrosDelDiaEmpleado,
  type CobrosDelDiaEmpleadoResponse,
} from "@/lib/empresa-api";
import { useDeferredMount } from "@/hooks/useDeferredMount";

export type TrabajadorCajaDiaContextValue = {
  fechaDia: string;
  data: CobrosDelDiaEmpleadoResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Saldo en `usuarios/{uid}.cajaEmpleado` (efectivo acumulado; va a 0 al aprobar entrega de reporte). */
  cajaEmpleadoRT: number | null;
  /** Alias de `cajaEmpleadoRT` para la tarjeta «Tu caja actual». */
  tuCajaActual: number | null;
  totalGastosRT: number | null;
  totalPrestamosRT: number | null;
  totalCobrosEfectivoRT: number | null;
};

const TrabajadorCajaDiaContext = createContext<TrabajadorCajaDiaContextValue | null>(null);

export function TrabajadorCajaDiaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const subscriptionsReady = useDeferredMount(50);
  const [fechaDia] = useState(() => fechaDiaColombiaHoy());
  const [data, setData] = useState<CobrosDelDiaEmpleadoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cajaEmpleadoRT, setCajaEmpleadoRT] = useState<number | null>(null);
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
    if (!subscriptionsReady) return;
    void refresh();
  }, [refresh, subscriptionsReady]);

  useEffect(() => {
    if (!subscriptionsReady || !db || !user || profile?.role !== "trabajador") return;
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
  }, [user?.uid, profile?.role, profile?.empresaId, subscriptionsReady]);

  useEffect(() => {
    if (!subscriptionsReady || !db || !user || profile?.role !== "trabajador") return;
    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) return;

    const q = query(
      collectionGroup(db, "pagos"),
      where("empleadoId", "==", user.uid),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    let initialLoad = true;

    const unsub = onSnapshot(
      q,
      (snap) => {
        let efectivo = 0;
        for (const d of snap.docs) {
          const x = d.data();
          if (x.tipo !== "pago") continue;
          if ((x.estado ?? "activo") === "anulado") continue;
          const monto = typeof x.monto === "number" ? x.monto : 0;
          if (monto <= 0) continue;
          const metodo = (x.metodoPago ?? "").toLowerCase();
          if (metodo === "efectivo" || metodo.includes("efect")) {
            efectivo += monto;
          }
        }
        setCobrosEfectivoRT(Math.round(efectivo * 100) / 100);

        if (!initialLoad) {
          const tieneModificaciones = snap
            .docChanges()
            .some((c) => c.type === "modified" || c.type === "removed");
          if (tieneModificaciones) {
            void refresh();
          }
        }
        initialLoad = false;
      },
      (err) => {
        console.warn("[TrabajadorCajaDia] onSnapshot pagos:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, fechaDia, refresh, subscriptionsReady]);

  useEffect(() => {
    if (!subscriptionsReady || !db || !user || profile?.role !== "trabajador") return;
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
  }, [user?.uid, profile?.role, profile?.empresaId, fechaDia, subscriptionsReady]);

  useEffect(() => {
    if (!subscriptionsReady || !db || !user || profile?.role !== "trabajador") return;
    const empresaId = profile?.empresaId?.trim();
    const rutaId = profile?.rutaId?.trim();
    if (!empresaId || !rutaId) return;

    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) return;

    const q = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, PRESTAMOS_SUBCOLLECTION),
      where("rutaId", "==", rutaId),
      where("empleadoId", "==", user.uid),
      where("desembolsoDesde", "==", "caja_empleado"),
      where("creadoEn", ">=", Timestamp.fromDate(start)),
      where("creadoEn", "<=", Timestamp.fromDate(end))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        let total = 0;
        for (const d of snap.docs) {
          const m = typeof d.data().monto === "number" && d.data().monto > 0 ? d.data().monto : 0;
          total += m;
        }
        setPrestamosRT(Math.round(total * 100) / 100);
      },
      (err) => {
        console.warn("[TrabajadorCajaDia] onSnapshot prestamos:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId, profile?.rutaId, fechaDia, subscriptionsReady]);

  const value = useMemo(
    (): TrabajadorCajaDiaContextValue => ({
      fechaDia,
      data,
      loading,
      error,
      refresh,
      cajaEmpleadoRT,
      tuCajaActual: cajaEmpleadoRT,
      totalGastosRT: gastosRT,
      totalPrestamosRT: prestamosRT,
      totalCobrosEfectivoRT: cobrosEfectivoRT,
    }),
    [
      fechaDia,
      data,
      loading,
      error,
      refresh,
      cajaEmpleadoRT,
      gastosRT,
      prestamosRT,
      cobrosEfectivoRT,
    ]
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
