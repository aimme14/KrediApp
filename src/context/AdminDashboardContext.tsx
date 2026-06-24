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
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import type { RutaItem, ResumenRutaItem } from "@/lib/empresa-api";
import { getCajaAdmin } from "@/lib/empresa-api";
import { computeCapitalRutaFromRutaFields } from "@/lib/capital-formulas";
import { useDeferredMount } from "@/hooks/useDeferredMount";

export type AdminRutaLive = RutaItem & {
  capitalRuta: number;
  totalPrestado: number;
};

export type AdminEmpleadoLive = {
  uid: string;
  nombre: string;
};

export type AdminRutaConEmpleados = AdminRutaLive & {
  empleados: AdminEmpleadoLive[];
};

export type AdminDashboardContextValue = {
  rutas: AdminRutaLive[];
  rutasConEmpleados: AdminRutaConEmpleados[];
  rutasResumen: ResumenRutaItem[];
  cajaAdmin: number;
  /** Gastos del periodo desde base admin (sin ruta); se reinicia al cerrar periodo. */
  gastosAdminPeriodo: number;
  totalClientes: number;
  totalMorosos: number;
  totalPrestamosActivos: number;
  capitalAdmin: number;
  gananciasTotales: number;
  loading: boolean;
  error: string | null;
  refreshCaja: () => Promise<void>;
};

const AdminDashboardContext = createContext<AdminDashboardContextValue | null>(null);

export function AdminDashboardProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const subscriptionsReady = useDeferredMount(50);

  const [rutasBase, setRutasBase] = useState<AdminRutaLive[]>([]);
  const [gastosAdminPeriodo, setGastosAdminPeriodo] = useState(0);
  const [empleadosPorRuta, setEmpleadosPorRuta] = useState<Map<string, AdminEmpleadoLive[]>>(
    () => new Map()
  );
  const [cajaAdmin, setCajaAdmin] = useState(0);
  const [totalClientes, setTotalClientes] = useState(0);
  const [totalMorosos, setTotalMorosos] = useState(0);
  const [totalPrestamosActivos, setTotalPrestamosActivos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCaja = useCallback(async () => {
    if (!user || profile?.role !== "admin") return;
    try {
      const token = await user.getIdToken();
      const caja = await getCajaAdmin(token);
      setCajaAdmin(caja);
    } catch (e) {
      console.warn("[AdminDashboardContext] Error al cargar cajaAdmin:", e);
    }
  }, [user, profile?.role]);

  useEffect(() => {
    if (!subscriptionsReady) return;
    if (!db) {
      setError("Firestore no está configurado en el cliente");
      setRutasBase([]);
      setLoading(false);
      return;
    }
    if (!user || !profile || profile.role !== "admin" || !profile.empresaId) {
      setRutasBase([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const empresaId = profile.empresaId;
    const rutasCol = collection(db, EMPRESAS_COLLECTION, empresaId, RUTAS_SUBCOLLECTION);
    const q = query(rutasCol, where("adminId", "==", user.uid));

    void refreshCaja();

    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista: AdminRutaLive[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
          const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
          const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
          const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
          const gastos = typeof data.gastos === "number" ? data.gastos : 0;
          const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;
          const totalPrestado = typeof data.totalPrestado === "number" ? data.totalPrestado : 0;
          const capitalTotalRaw =
            typeof data.capitalTotal === "number" ? data.capitalTotal : undefined;

          const capitalRuta = computeCapitalRutaFromRutaFields({
            cajaRuta,
            cajasEmpleados,
            inversiones,
            ganancias,
            perdidas,
            capitalTotal: capitalTotalRaw,
          });

          const capitalTotal =
            typeof capitalTotalRaw === "number" ? capitalTotalRaw : capitalRuta;

          return {
            id: d.id,
            nombre: (data.nombre as string) ?? "",
            ubicacion: (data.ubicacion as string) ?? "",
            base: (data.base as string) ?? "",
            descripcion: (data.descripcion as string) ?? "",
            adminId: (data.adminId as string) ?? "",
            empleadoId: (data.empleadoId as string) ?? "",
            fechaCreacion: null,
            codigo: typeof data.codigo === "string" ? data.codigo : undefined,
            cajaRuta,
            cajasEmpleados,
            inversiones,
            ganancias,
            gastos,
            perdidas,
            totalPrestado,
            capitalTotal,
            capitalRuta,
          };
        });

        setRutasBase(lista);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message ?? "Error al suscribirse a rutas");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.uid, profile?.role, profile?.empresaId, refreshCaja, subscriptionsReady]);

  /** Contador de gastos por ruta: solo `ruta.gastos` (se reinicia al cerrar periodo). */
  const rutas = rutasBase;

  useEffect(() => {
    if (!subscriptionsReady || !db || !user || !profile || profile.role !== "admin" || !profile.empresaId) {
      setCajaAdmin(0);
      setGastosAdminPeriodo(0);
      setTotalClientes(0);
      setTotalMorosos(0);
      setTotalPrestamosActivos(0);
      return;
    }

    const adminRef = doc(
      db,
      EMPRESAS_COLLECTION,
      profile.empresaId,
      USUARIOS_SUBCOLLECTION,
      user.uid
    );

    const unsub = onSnapshot(
      adminRef,
      (snap) => {
        if (!snap.exists()) {
          setCajaAdmin(0);
          setGastosAdminPeriodo(0);
          setTotalClientes(0);
          setTotalMorosos(0);
          setTotalPrestamosActivos(0);
          return;
        }
        const d = snap.data() as Record<string, unknown>;
        setCajaAdmin(typeof d.cajaAdmin === "number" ? d.cajaAdmin : 0);
        setGastosAdminPeriodo(typeof d.gastosAdmin === "number" ? d.gastosAdmin : 0);
        setTotalClientes(typeof d.totalClientes === "number" ? d.totalClientes : 0);
        setTotalMorosos(typeof d.totalMorosos === "number" ? d.totalMorosos : 0);
        setTotalPrestamosActivos(
          typeof d.totalPrestamosActivos === "number" ? d.totalPrestamosActivos : 0
        );
      },
      (err) => {
        console.warn("[AdminDashboardContext] Error al suscribirse a usuario admin:", err);
      }
    );

    return () => unsub();
  }, [user, profile, subscriptionsReady]);

  useEffect(() => {
    if (!subscriptionsReady || !db || !user || !profile || profile.role !== "admin" || !profile.empresaId) {
      setEmpleadosPorRuta(new Map());
      return;
    }

    const empresaId = profile.empresaId;
    const usuariosCol = collection(db, EMPRESAS_COLLECTION, empresaId, USUARIOS_SUBCOLLECTION);
    const qEmp = query(
      usuariosCol,
      where("rol", "==", "empleado"),
      where("adminId", "==", user.uid)
    );

    const unsub = onSnapshot(
      qEmp,
      async (snap) => {
        const uids = snap.docs.map((d) => d.id);
        const rutaIdPorUid = new Map<string, string>();
        for (const d of snap.docs) {
          const rutaId = d.data().rutaId as string | undefined;
          if (rutaId) rutaIdPorUid.set(d.id, rutaId);
        }

        const perfiles = await Promise.all(
          uids.map(async (uid) => {
            if (!db) return { uid, nombre: "Sin nombre" };
            try {
              const userSnap = await getDoc(doc(db, USERS_COLLECTION, uid));
              const nombre =
                (userSnap.data()?.displayName as string | undefined)?.trim() || "Sin nombre";
              return { uid, nombre };
            } catch {
              return { uid, nombre: "Sin nombre" };
            }
          })
        );

        const map = new Map<string, AdminEmpleadoLive[]>();
        for (const p of perfiles) {
          const rutaId = rutaIdPorUid.get(p.uid);
          if (!rutaId) continue;
          const list = map.get(rutaId) ?? [];
          list.push({ uid: p.uid, nombre: p.nombre });
          map.set(rutaId, list);
        }
        setEmpleadosPorRuta(map);
      },
      (err) => {
        console.warn("[AdminDashboardContext] Error al suscribirse a empleados por ruta:", err);
      }
    );

    return () => unsub();
  }, [user, profile, subscriptionsReady]);

  const rutasConEmpleados = useMemo((): AdminRutaConEmpleados[] => {
    return rutas.map((r) => ({
      ...r,
      empleados: empleadosPorRuta.get(r.id) ?? [],
    }));
  }, [rutas, empleadosPorRuta]);

  const rutasResumen = useMemo((): ResumenRutaItem[] => {
    return rutas.map((r) => ({
      rutaId: r.id,
      nombre: r.nombre,
      ubicacion: r.ubicacion,
      ingreso: 0,
      egreso: 0,
      gastos: r.gastos ?? 0,
      salidas: 0,
      inversion: r.inversiones ?? 0,
      bolsa: r.ganancias ?? 0,
      cajaRuta: r.cajaRuta ?? 0,
      cajasEmpleados: r.cajasEmpleados ?? 0,
      ganancias: r.ganancias ?? 0,
      perdidas: r.perdidas ?? 0,
      utilidad: 0,
      capitalRuta: r.capitalRuta,
      adminId: r.adminId,
    }));
  }, [rutas]);

  const gananciasTotales = useMemo(
    () => rutas.reduce((sum, r) => sum + (r.ganancias ?? 0), 0),
    [rutas]
  );

  const capitalAdmin = useMemo(() => {
    const sumaCapitalRutas = rutas.reduce((sum, r) => sum + r.capitalRuta, 0);
    return cajaAdmin + sumaCapitalRutas;
  }, [cajaAdmin, rutas]);

  const value = useMemo(
    (): AdminDashboardContextValue => ({
      rutas,
      rutasConEmpleados,
      rutasResumen,
      cajaAdmin,
      gastosAdminPeriodo,
      totalClientes,
      totalMorosos,
      totalPrestamosActivos,
      capitalAdmin,
      gananciasTotales,
      loading,
      error,
      refreshCaja,
    }),
    [
      rutas,
      rutasConEmpleados,
      rutasResumen,
      cajaAdmin,
      gastosAdminPeriodo,
      totalClientes,
      totalMorosos,
      totalPrestamosActivos,
      capitalAdmin,
      gananciasTotales,
      loading,
      error,
      refreshCaja,
    ]
  );

  return (
    <AdminDashboardContext.Provider value={value}>{children}</AdminDashboardContext.Provider>
  );
}

export function useAdminDashboard(): AdminDashboardContextValue {
  const ctx = useContext(AdminDashboardContext);
  if (!ctx) {
    throw new Error("useAdminDashboard debe usarse dentro de AdminDashboardProvider");
  }
  return ctx;
}

export function useAdminDashboardOptional(): AdminDashboardContextValue | null {
  return useContext(AdminDashboardContext);
}
