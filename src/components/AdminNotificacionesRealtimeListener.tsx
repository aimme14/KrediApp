"use client";

import { useEffect, useRef } from "react";
import {
  collection,
  collectionGroup,
  query,
  where,
  onSnapshot,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { useGastoFcmCampanita } from "@/context/GastoFcmCampanitaContext";
import {
  EMPRESAS_COLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  SOLICITUDES_PRESTAMO_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { fechaDiaColombiaHoy, inicioDiaColombiaUtc } from "@/lib/colombia-day-bounds";
import {
  mapGastoEmpleadoNotif,
  mapClienteEmpleadoNotif,
  mapPrestamoEmpleadoNotif,
  mapSolicitudPrestamoNotif,
  mapPagoEmpleadoNotif,
  mergeAdminOperativoNotifs,
  type AdminOperativoNotifItem,
} from "@/lib/admin-notificaciones-operativas";

const USERS_COLLECTION = "users";

/**
 * Campanita admin alimentada por Firestore en tiempo real (onSnapshot).
 * Vive dentro del layout admin para reutilizar TrabajadorLista (clientes) y evitar
 * listeners duplicados que provocan INTERNAL ASSERTION en el SDK de Firestore.
 */
export function AdminNotificacionesRealtimeListener() {
  const { user, profile } = useAuth();
  const { clientes } = useTrabajadorLista();
  const { syncOperativoFromFirestore, setSolicitudesPrestamoPendientesCount } =
    useGastoFcmCampanita();
  const bucketsRef = useRef<Record<string, AdminOperativoNotifItem[]>>({});
  const nombresRef = useRef<Map<string, string>>(new Map());
  const syncRef = useRef(syncOperativoFromFirestore);
  const setSolicitudesCountRef = useRef(setSolicitudesPrestamoPendientesCount);

  syncRef.current = syncOperativoFromFirestore;
  setSolicitudesCountRef.current = setSolicitudesPrestamoPendientesCount;

  const recompute = () => {
    const merged = mergeAdminOperativoNotifs(Object.values(bucketsRef.current));
    syncRef.current(merged);
  };

  const setBucket = (key: string, items: AdminOperativoNotifItem[]) => {
    bucketsRef.current[key] = items;
    recompute();
  };

  const resolveNombre = async (uid: string): Promise<string> => {
    const cached = nombresRef.current.get(uid);
    if (cached) return cached;
    if (!db) return uid.slice(0, 8);
    try {
      const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
      const d = snap.data();
      const name =
        (typeof d?.displayName === "string" && d.displayName.trim()) ||
        (typeof d?.email === "string" && d.email.trim()) ||
        uid.slice(0, 8);
      nombresRef.current.set(uid, name);
      return name;
    } catch {
      return uid.slice(0, 8);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const items: AdminOperativoNotifItem[] = [];
      for (const c of clientes) {
        if (c.creadoPorRol !== "empleado") continue;
        const empleadoNombre =
          (c.creadoPorNombre?.trim()) ||
          (c.creadoPorUid ? await resolveNombre(c.creadoPorUid) : "Trabajador");
        if (cancelled) return;
        const item = mapClienteEmpleadoNotif(
          c.id,
          {
            creadoPorRol: c.creadoPorRol,
            fechaCreacion: c.fechaCreacion,
            nombre: c.nombre,
          },
          empleadoNombre
        );
        if (item) items.push(item);
      }
      if (!cancelled) setBucket("clientes", items);
    })();

    return () => {
      cancelled = true;
    };
  }, [clientes]);

  useEffect(() => {
    if (!db || !user || profile?.role !== "admin" || !profile.empresaId) {
      setSolicitudesCountRef.current(0);
      return;
    }

    const empresaId = profile.empresaId.trim();
    const adminUid = user.uid;
    if (!empresaId) return;

    const hoy = fechaDiaColombiaHoy();
    const inicioDia = inicioDiaColombiaUtc(hoy);
    if (!inicioDia) return;
    const inicioTs = Timestamp.fromDate(inicioDia);

    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const qGastos = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, GASTOS_EMPLEADO_SUBCOLLECTION),
      where("adminId", "==", adminUid),
      where("fecha", ">=", inicioTs)
    );
    unsubs.push(
      onSnapshot(
        qGastos,
        (snap) => {
          if (cancelled) return;
          const items: AdminOperativoNotifItem[] = [];
          snap.docs.forEach((d) => {
            const item = mapGastoEmpleadoNotif(d.id, d.data() as Record<string, unknown>);
            if (item) items.push(item);
          });
          setBucket("gastos", items);
        },
        (err) => console.warn("[AdminNotifRT] gastos:", err)
      )
    );

    const qPrestamos = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, PRESTAMOS_SUBCOLLECTION),
      where("adminId", "==", adminUid)
    );
    unsubs.push(
      onSnapshot(
        qPrestamos,
        (snap) => {
          if (cancelled) return;
          void (async () => {
            const items: AdminOperativoNotifItem[] = [];
            for (const d of snap.docs) {
              const data = d.data() as Record<string, unknown>;
              if (data.desembolsoDesde !== "caja_empleado") continue;
              const empleadoUid =
                typeof data.empleadoId === "string" ? data.empleadoId : "";
              const empleadoNombre =
                (typeof data.empleadoNombre === "string" &&
                  data.empleadoNombre.trim()) ||
                (empleadoUid ? await resolveNombre(empleadoUid) : "Trabajador");
              if (cancelled) return;
              const item = mapPrestamoEmpleadoNotif(d.id, data, empleadoNombre);
              if (item) items.push(item);
            }
            if (!cancelled) setBucket("prestamos", items);
          })();
        },
        (err) => console.warn("[AdminNotifRT] prestamos:", err)
      )
    );

    const qSolicitudes = query(
      collection(
        db,
        EMPRESAS_COLLECTION,
        empresaId,
        SOLICITUDES_PRESTAMO_SUBCOLLECTION
      ),
      where("adminId", "==", adminUid),
      where("estado", "==", "pendiente")
    );
    unsubs.push(
      onSnapshot(
        qSolicitudes,
        (snap) => {
          if (cancelled) return;
          setSolicitudesCountRef.current(snap.size);
          const items: AdminOperativoNotifItem[] = [];
          snap.docs.forEach((d) => {
            const data = d.data() as Record<string, unknown>;
            const empleadoNombre =
              (typeof data.empleadoNombre === "string" &&
                data.empleadoNombre.trim()) ||
              "Trabajador";
            const item = mapSolicitudPrestamoNotif(d.id, data, empleadoNombre);
            if (item) items.push(item);
          });
          setBucket("solicitudes", items);
        },
        (err) => console.warn("[AdminNotifRT] solicitudes:", err)
      )
    );

    const qPagos = query(
      collectionGroup(db, "pagos"),
      where("adminId", "==", adminUid),
      where("fecha", ">=", inicioTs)
    );
    unsubs.push(
      onSnapshot(
        qPagos,
        (snap) => {
          if (cancelled) return;
          const items: AdminOperativoNotifItem[] = [];
          snap.docs.forEach((d) => {
            const data = d.data() as Record<string, unknown>;
            if (data.empresaId && data.empresaId !== empresaId) return;
            if (data.cobradoPorRol === "admin") return;
            if (!data.adminId) return;
            const item = mapPagoEmpleadoNotif(d.id, data);
            if (item) items.push(item);
          });
          setBucket("pagos", items);
        },
        (err) => console.warn("[AdminNotifRT] pagos:", err)
      )
    );

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      bucketsRef.current = {};
      setSolicitudesCountRef.current(0);
    };
  }, [user?.uid, profile?.role, profile?.empresaId]);

  return null;
}
