"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  startAfter,
  getDocs,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  esPrestamoDeClienteMoroso,
  syncMorosoPrestamos,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import { ESTADO_PRESTAMO_ABIERTO, normalizeEstadoPrestamo } from "@/lib/prestamo-estado";

const EMPRESAS_COLLECTION = "empresas";
const PRESTAMOS_SUBCOLLECTION = "prestamos";
const CLIENTES_SUBCOLLECTION = "clientes";
const PAGE_SIZE_PAGADOS = 20;

export type DatosSyncEstado = "synced" | "syncing" | "offline";

/** Con caché persistente, Firestore responde primero desde disco; no esperar confirmación del servidor. */
function resolveDatosSyncEstado(): DatosSyncEstado {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "offline";
  }
  return "synced";
}

export type TrabajadorListaContextValue = {
  clientes: ClienteItem[];
  /** Préstamos abiertos (activos) — en tiempo real */
  prestamos: PrestamoItem[];
  /** Préstamos pagados — carga lazy */
  prestamosPagados: PrestamoItem[];
  loadingPagados: boolean;
  hayMasPagados: boolean;
  cargarMasPagados: () => Promise<void>;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number;
  datosSyncEstado: DatosSyncEstado;
  refresh: () => Promise<void>;
};

const TrabajadorListaContext = createContext<TrabajadorListaContextValue | null>(null);

function enriquecerMorosoPrestamo(
  p: PrestamoItem,
  morosoPorCliente: Map<string, boolean>
): PrestamoItem {
  return {
    ...p,
    moroso: esPrestamoDeClienteMoroso(p, morosoPorCliente.get(p.clienteId)),
  };
}

function mapPrestamo(d: QueryDocumentSnapshot): PrestamoItem {
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
    estado: normalizeEstadoPrestamo(data.estado),
    fechaInicio: data.fechaInicio?.toDate?.()?.toISOString?.() ?? null,
    fechaVencimiento: data.fechaVencimiento?.toDate?.()?.toISOString?.() ?? null,
    creadoEn: data.creadoEn?.toDate?.()?.toISOString?.() ?? null,
    adelantoCuota: data.adelantoCuota ?? 0,
    ultimoPagoFecha: data.ultimoPagoFecha?.toDate?.()?.toISOString?.() ?? null,
    intentosFallidos: typeof data.intentosFallidos === "number" ? data.intentosFallidos : 0,
    moroso: data.moroso === true,
  };
}

export function TrabajadorListaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [prestamosPagados, setPrestamosPagados] = useState<PrestamoItem[]>([]);
  const [loadingPagados, setLoadingPagados] = useState(false);
  const [hayMasPagados, setHayMasPagados] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [datosSyncEstado, setDatosSyncEstado] = useState<DatosSyncEstado>("syncing");
  const lastDocPagadosRef = useRef<QueryDocumentSnapshot | null>(null);
  const syncMorosoHechoRef = useRef(false);

  const refresh = useCallback(async () => {
    // onSnapshot actualiza automáticamente
  }, []);

  useEffect(() => {
    syncMorosoHechoRef.current = false;
  }, [user?.uid, profile?.empresaId]);

  useEffect(() => {
    if (!user || !profile) return;
    const canUse = profile.role === "trabajador" || profile.role === "admin";
    if (!canUse || syncMorosoHechoRef.current) return;

    syncMorosoHechoRef.current = true;
    void user
      .getIdToken()
      .then((token) => syncMorosoPrestamos(token))
      .catch((e) => console.warn("[TrabajadorLista] sync moroso:", e));
  }, [user, profile?.role, profile?.empresaId]);

  useEffect(() => {
    lastDocPagadosRef.current = null;
    setPrestamosPagados([]);
    setHayMasPagados(true);
    setLoadingPagados(false);
    setDatosSyncEstado("syncing");
  }, [user?.uid, profile?.empresaId, profile?.rutaId]);

  useEffect(() => {
    const onOffline = () => setDatosSyncEstado("offline");
    const onOnline = () => setDatosSyncEstado("synced");
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!db || !user || !profile) return;
    const empresaId = profile.empresaId?.trim();
    if (!empresaId) return;
    const canUse = profile.role === "trabajador" || profile.role === "admin";
    if (!canUse) return;

    setLoading(true);
    const clientesCol = collection(db, EMPRESAS_COLLECTION, empresaId, CLIENTES_SUBCOLLECTION);
    const q =
      profile.role === "trabajador" && profile.rutaId
        ? query(clientesCol, where("rutaId", "==", profile.rutaId))
        : query(clientesCol, where("adminId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setDatosSyncEstado(resolveDatosSyncEstado());
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
            creadoPorRol: typeof data.creadoPorRol === "string" ? data.creadoPorRol : undefined,
            creadoPorNombre:
              typeof data.creadoPorNombre === "string" ? data.creadoPorNombre : undefined,
            creadoPorUid: typeof data.creadoPorUid === "string" ? data.creadoPorUid : undefined,
          };
        });
        list.sort(
          (a, b) =>
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

    const prestamosCol = collection(db, EMPRESAS_COLLECTION, empresaId, PRESTAMOS_SUBCOLLECTION);

    const q =
      profile.role === "trabajador" && profile.rutaId
        ? query(
            prestamosCol,
            where("rutaId", "==", profile.rutaId),
            where("estado", "==", ESTADO_PRESTAMO_ABIERTO)
          )
        : query(
            prestamosCol,
            where("adminId", "==", user.uid),
            where("estado", "==", ESTADO_PRESTAMO_ABIERTO)
          );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPrestamos(snap.docs.map(mapPrestamo));
      },
      (err) => {
        console.warn("[TrabajadorLista] onSnapshot préstamos activos:", err);
      }
    );
    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId, profile?.rutaId]);

  const cargarMasPagados = useCallback(async () => {
    if (!db || !user || !profile || loadingPagados || !hayMasPagados) return;
    const empresaId = profile.empresaId?.trim();
    if (!empresaId) return;

    setLoadingPagados(true);
    try {
      const prestamosCol = collection(db, EMPRESAS_COLLECTION, empresaId, PRESTAMOS_SUBCOLLECTION);

      const constraints: QueryConstraint[] =
        profile.role === "trabajador" && profile.rutaId
          ? [
              where("rutaId", "==", profile.rutaId),
              where("estado", "==", "pagado"),
              orderBy("fechaInicio", "desc"),
            ]
          : [
              where("adminId", "==", user.uid),
              where("estado", "==", "pagado"),
              orderBy("fechaInicio", "desc"),
            ];

      if (lastDocPagadosRef.current) {
        constraints.push(startAfter(lastDocPagadosRef.current));
      }
      constraints.push(limit(PAGE_SIZE_PAGADOS));

      const snap = await getDocs(query(prestamosCol, ...constraints));
      const nuevos = snap.docs.map(mapPrestamo);

      if (snap.docs.length < PAGE_SIZE_PAGADOS) setHayMasPagados(false);
      if (snap.docs.length > 0) {
        lastDocPagadosRef.current = snap.docs[snap.docs.length - 1] ?? null;
      }

      setPrestamosPagados((prev) => [...prev, ...nuevos]);
    } catch (e) {
      console.warn("[TrabajadorLista] fetch pagados:", e);
    } finally {
      setLoadingPagados(false);
    }
  }, [user, profile, loadingPagados, hayMasPagados]);

  const morosoPorCliente = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of clientes) {
      if (c.moroso) m.set(c.id, true);
    }
    return m;
  }, [clientes]);

  const prestamosConMoroso = useMemo(
    () => prestamos.map((p) => enriquecerMorosoPrestamo(p, morosoPorCliente)),
    [prestamos, morosoPorCliente]
  );

  const prestamosPagadosConMoroso = useMemo(
    () => prestamosPagados.map((p) => enriquecerMorosoPrestamo(p, morosoPorCliente)),
    [prestamosPagados, morosoPorCliente]
  );

  const value = useMemo(
    (): TrabajadorListaContextValue => ({
      clientes,
      prestamos: prestamosConMoroso,
      prestamosPagados: prestamosPagadosConMoroso,
      loadingPagados,
      hayMasPagados,
      cargarMasPagados,
      loading,
      error,
      lastFetchedAt,
      datosSyncEstado,
      refresh,
    }),
    [
      clientes,
      prestamosConMoroso,
      prestamosPagadosConMoroso,
      loadingPagados,
      hayMasPagados,
      cargarMasPagados,
      loading,
      error,
      lastFetchedAt,
      datosSyncEstado,
      refresh,
    ]
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
