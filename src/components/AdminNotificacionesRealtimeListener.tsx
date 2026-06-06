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
import { useGastoFcmCampanita } from "@/context/GastoFcmCampanitaContext";
import {
  EMPRESAS_COLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
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
 * El push FCM (PWA cerrada) sigue en AdminFcmRegistration + service worker.
 */
export function AdminNotificacionesRealtimeListener() {
  const { user, profile } = useAuth();
  const { syncOperativoFromFirestore } = useGastoFcmCampanita();
  const bucketsRef = useRef<Record<string, AdminOperativoNotifItem[]>>({});
  const nombresRef = useRef<Map<string, string>>(new Map());

  const recompute = () => {
    const merged = mergeAdminOperativoNotifs(Object.values(bucketsRef.current));
    syncOperativoFromFirestore(merged);
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
    if (!db || !user || profile?.role !== "admin" || !profile.empresaId) return;

    const empresaId = profile.empresaId.trim();
    const adminUid = user.uid;
    if (!empresaId) return;

    const hoy = fechaDiaColombiaHoy();
    const inicioDia = inicioDiaColombiaUtc(hoy);
    if (!inicioDia) return;
    const inicioTs = Timestamp.fromDate(inicioDia);

    const unsubs: Array<() => void> = [];

    // Gastos de trabajadores (hoy)
    const qGastos = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, GASTOS_EMPLEADO_SUBCOLLECTION),
      where("adminId", "==", adminUid),
      where("fecha", ">=", inicioTs)
    );
    unsubs.push(
      onSnapshot(
        qGastos,
        (snap) => {
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

    // Clientes creados hoy por trabajadores
    const qClientes = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, CLIENTES_SUBCOLLECTION),
      where("adminId", "==", adminUid)
    );
    unsubs.push(
      onSnapshot(
        qClientes,
        (snap) => {
          void (async () => {
            const items: AdminOperativoNotifItem[] = [];
            for (const d of snap.docs) {
              const data = d.data() as Record<string, unknown>;
              if (data.creadoPorRol !== "empleado") continue;
              const empleadoNombre =
                (typeof data.creadoPorNombre === "string" && data.creadoPorNombre.trim()) ||
                (typeof data.creadoPorUid === "string"
                  ? await resolveNombre(data.creadoPorUid)
                  : "Trabajador");
              const item = mapClienteEmpleadoNotif(d.id, data, empleadoNombre);
              if (item) items.push(item);
            }
            setBucket("clientes", items);
          })();
        },
        (err) => console.warn("[AdminNotifRT] clientes:", err)
      )
    );

    // Préstamos desembolsados hoy por trabajadores
    const qPrestamos = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, PRESTAMOS_SUBCOLLECTION),
      where("adminId", "==", adminUid)
    );
    unsubs.push(
      onSnapshot(
        qPrestamos,
        (snap) => {
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
              const item = mapPrestamoEmpleadoNotif(d.id, data, empleadoNombre);
              if (item) items.push(item);
            }
            setBucket("prestamos", items);
          })();
        },
        (err) => console.warn("[AdminNotifRT] prestamos:", err)
      )
    );

    // Solicitudes de préstamo pendientes (hoy)
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

    // Cobros / no pagos / pérdidas de trabajadores (hoy)
    const qPagos = query(
      collectionGroup(db, "pagos"),
      where("adminId", "==", adminUid),
      where("fecha", ">=", inicioTs)
    );
    unsubs.push(
      onSnapshot(
        qPagos,
        (snap) => {
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
      unsubs.forEach((u) => u());
      bucketsRef.current = {};
    };
  }, [user?.uid, profile?.role, profile?.empresaId, syncOperativoFromFirestore]);

  return null;
}
