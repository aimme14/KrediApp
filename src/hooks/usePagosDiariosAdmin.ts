"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collectionGroup,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import {
  inicioDiaColombiaUtc,
  finDiaColombiaUtc,
  fechaDiaColombiaHoy,
} from "@/lib/colombia-day-bounds";
import { calcularTotalesPagosDiariosAdmin } from "@/lib/pagos-diarios-filter";

export type PagoDiarioAdminItem = {
  id: string;
  prestamoId: string;
  monto: number;
  fecha: string | null;
  tipo: "pago" | "no_pago" | "perdida";
  metodoPago: string | null;
  clienteNombre: string;
  rutaNombre: string;
  rutaId: string;
  empleadoId: string;
  registradoPorNombre: string | null;
  cobradoPorRol: string | null;
  estado: "activo" | "anulado";
  evidencia: string | null;
  motivoNoPago: string | null;
  motivoPerdida: string | null;
};

export type PagosDiariosAdminTotales = {
  totalCobros: number;
  totalEfectivo: number;
  totalTransferencia: number;
  countCobros: number;
  countNoPagos: number;
  countPerdidas: number;
};

function mapDoc(id: string, d: Record<string, unknown>): PagoDiarioAdminItem {
  const fechaRaw = d.fecha as { toDate?: () => Date } | undefined;
  const fecha =
    typeof fechaRaw?.toDate === "function" ? fechaRaw.toDate().toISOString() : null;

  return {
    id,
    prestamoId: typeof d.prestamoId === "string" ? d.prestamoId : "",
    monto: typeof d.monto === "number" ? d.monto : 0,
    fecha,
    tipo:
      d.tipo === "no_pago" || d.tipo === "perdida" ? d.tipo : "pago",
    metodoPago: typeof d.metodoPago === "string" ? d.metodoPago : null,
    clienteNombre:
      typeof d.clienteNombre === "string" && d.clienteNombre.trim()
        ? d.clienteNombre.trim()
        : "—",
    rutaNombre:
      typeof d.rutaNombre === "string" && d.rutaNombre.trim()
        ? d.rutaNombre.trim()
        : "—",
    rutaId: typeof d.rutaId === "string" ? d.rutaId : "",
    empleadoId: typeof d.empleadoId === "string" ? d.empleadoId : "",
    registradoPorNombre:
      typeof d.registradoPorNombre === "string" ? d.registradoPorNombre : null,
    cobradoPorRol: typeof d.cobradoPorRol === "string" ? d.cobradoPorRol : null,
    estado: d.estado === "anulado" ? "anulado" : "activo",
    evidencia: typeof d.evidencia === "string" && d.evidencia.trim() ? d.evidencia : null,
    motivoNoPago: typeof d.motivoNoPago === "string" ? d.motivoNoPago : null,
    motivoPerdida: typeof d.motivoPerdida === "string" ? d.motivoPerdida : null,
  };
}

export function usePagosDiariosAdmin(fechaDia: string) {
  const { user, profile } = useAuth();
  const [pagos, setPagos] = useState<PagoDiarioAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !user || !isAdminPanelRole(profile?.role) || !profile?.empresaId) {
      setPagos([]);
      setLoading(false);
      return;
    }

    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) {
      setError("Fecha inválida");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collectionGroup(db, "pagos"),
      where("empresaId", "==", profile.empresaId),
      where("adminId", "==", user.uid),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((doc) => mapDoc(doc.id, doc.data() as Record<string, unknown>));
        rows.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
        setPagos(rows);
        setLoading(false);
      },
      (err) => {
        console.warn("[usePagosDiariosAdmin] onSnapshot:", err);
        setError(err.message || "Error al cargar pagos del día");
        setLoading(false);
      }
    );

    return unsub;
  }, [user?.uid, profile?.role, profile?.empresaId, fechaDia]);

  const totales = useMemo(
    (): PagosDiariosAdminTotales => calcularTotalesPagosDiariosAdmin(pagos),
    [pagos]
  );

  const fechaHoy = fechaDiaColombiaHoy();

  return { pagos, totales, loading, error, fechaHoy };
}
