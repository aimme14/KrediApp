"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import { EMPRESAS_COLLECTION, REPORTES_DIA_SUBCOLLECTION } from "@/lib/empresas-db";
import { inicioDiaColombiaUtc } from "@/lib/colombia-day-bounds";
import {
  mapRangoReporteAceptado,
  VENTANA_MS_REPORTES_ANULACION,
  type RangoReporteAceptado,
} from "@/lib/cobro-reporte-aceptado";

export function useReportesAceptadosAdmin(fechaDia: string): {
  reportes: RangoReporteAceptado[];
  listos: boolean;
} {
  const { user, profile } = useAuth();
  const [reportes, setReportes] = useState<RangoReporteAceptado[]>([]);
  const [listos, setListos] = useState(false);

  useEffect(() => {
    if (!db || !user || !isAdminPanelRole(profile?.role) || !profile?.empresaId) {
      setReportes([]);
      setListos(true);
      return;
    }

    const inicio = inicioDiaColombiaUtc(fechaDia);
    if (!inicio) {
      setReportes([]);
      setListos(true);
      return;
    }

    setListos(false);
    const fin = new Date(inicio.getTime() + VENTANA_MS_REPORTES_ANULACION);
    const q = query(
      collection(db, EMPRESAS_COLLECTION, profile.empresaId, REPORTES_DIA_SUBCOLLECTION),
      where("adminId", "==", user.uid),
      where("fecha", ">=", Timestamp.fromDate(inicio)),
      where("fecha", "<=", Timestamp.fromDate(fin)),
      orderBy("fecha", "asc"),
      limit(300)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setReportes(
          snap.docs.map((d) => mapRangoReporteAceptado(d.data() as Record<string, unknown>))
        );
        setListos(true);
      },
      () => {
        setReportes([]);
        setListos(true);
      }
    );
    return () => unsub();
  }, [user, profile?.role, profile?.empresaId, fechaDia]);

  return { reportes, listos };
}
