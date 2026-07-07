"use client";

import { useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { useGastoFcmCampanita } from "@/context/GastoFcmCampanitaContext";
import {
  EMPRESAS_COLLECTION,
  SOLICITUDES_PRESTAMO_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import {
  mapClienteEmpleadoNotif,
  mapSolicitudPrestamoNotif,
  mergeAdminOperativoNotifs,
  type AdminOperativoNotifItem,
} from "@/lib/admin-notificaciones-operativas";

const USERS_COLLECTION = "users";

/**
 * Campanita admin: solicitudes pendientes y clientes vía Firestore;
 * gastos, cuotas y préstamos llegan por FCM foreground (AdminFcmRegistration).
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
          c.creadoPorNombre?.trim() ||
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
    if (!db || !user || !isAdminPanelRole(profile?.role) || !profile?.empresaId) {
      setSolicitudesCountRef.current(0);
      return;
    }

    const empresaId = profile.empresaId.trim();
    const adminUid = user.uid;
    if (!empresaId) return;

    let cancelled = false;

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

    const unsub = onSnapshot(
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
    );

    return () => {
      cancelled = true;
      unsub();
      bucketsRef.current = {};
      setSolicitudesCountRef.current(0);
    };
  }, [user?.uid, profile?.role, profile?.empresaId]);

  return null;
}
