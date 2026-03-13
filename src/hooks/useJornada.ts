"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { EMPRESAS_COLLECTION } from "@/lib/empresas-db";
import type { Jornada, Movimiento } from "@/types/finanzas";
import {
  iniciarJornada as iniciarJornadaService,
  registrarGasto as registrarGastoService,
  cerrarJornada as cerrarJornadaService,
} from "@/services/jornadaService";

const JORNADAS_SUBCOLLECTION = "jornadas";
const MOVIMIENTOS_SUBCOLLECTION = "movimientos";

interface UseJornadaState {
  jornadaActiva: Jornada | null;
  movimientos: Movimiento[];
  loading: boolean;
  error: string | null;
  iniciar: (montoEntrega: number) => Promise<void>;
  registrarGasto: (
    monto: number,
    descripcion: string,
    categoria: "transporte" | "alimentacion" | "otro"
  ) => Promise<void>;
  cerrar: () => Promise<void>;
}

export function useJornada(): UseJornadaState {
  const { user, profile } = useAuth();
  const [jornadaActiva, setJornadaActiva] = useState<Jornada | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubMovimientosRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!db || !user || !profile || profile.role !== "trabajador" || !profile.empresaId) {
      setLoading(false);
      return;
    }

    const empresaId = profile.empresaId;
    const jornadasCol = collection(db, EMPRESAS_COLLECTION, empresaId, JORNADAS_SUBCOLLECTION);
    const q = query(
      jornadasCol,
      where("empleadoId", "==", user.uid),
      where("estado", "==", "activa")
    );

    const unsubJornada = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          unsubMovimientosRef.current?.();
          unsubMovimientosRef.current = null;
          setJornadaActiva(null);
          setMovimientos([]);
          setLoading(false);
          return;
        }
        const d = snap.docs[0];
        const data = d.data() as any;
        const j: Jornada = {
          id: d.id,
          rutaId: data.rutaId,
          empleadoId: data.empleadoId,
          empleadoNombre: data.empleadoNombre,
          fecha: data.fecha,
          estado: data.estado,
          entregaInicial: data.entregaInicial ?? 0,
          cobrosDelDia: data.cobrosDelDia ?? 0,
          gastosDelDia: data.gastosDelDia ?? 0,
          cajaActual: data.cajaActual ?? 0,
          devueltoAlCierre: data.devueltoAlCierre ?? 0,
          clientesVisitados: data.clientesVisitados ?? 0,
          clientesCobrados: data.clientesCobrados ?? 0,
          clientesNoPagaron: data.clientesNoPagaron ?? 0,
        };
        setJornadaActiva(j);
        setLoading(false);

        unsubMovimientosRef.current?.();
        const movimientosCol = collection(
          d.ref,
          MOVIMIENTOS_SUBCOLLECTION
        );
        const mq = query(movimientosCol, orderBy("fecha", "asc"));
        unsubMovimientosRef.current = onSnapshot(mq, (msnap) => {
          const items: Movimiento[] = msnap.docs.map((md) => {
            const mv = md.data() as any;
            return {
              id: md.id,
              tipo: mv.tipo,
              monto: mv.monto,
              descripcion: mv.descripcion,
              fecha: mv.fecha,
              prestamoId: mv.prestamoId,
              cuotaId: mv.cuotaId,
              clienteId: mv.clienteId,
              clienteNombre: mv.clienteNombre,
              cuotaCapital: mv.cuotaCapital,
              cuotaGanancia: mv.cuotaGanancia,
              categoriaGasto: mv.categoriaGasto,
            };
          });
          setMovimientos(items);
        });
      },
      (err) => {
        setError(err.message ?? "Error al suscribirse a la jornada");
        setLoading(false);
      }
    );

    return () => {
      unsubMovimientosRef.current?.();
      unsubMovimientosRef.current = null;
      unsubJornada();
    };
  }, [user, profile]);

  const iniciar = async (montoEntrega: number) => {
    if (!user || !profile || profile.role !== "trabajador" || !profile.empresaId) return;
    if (!profile.empresaId) {
      setError("No se encontró empresa para el trabajador");
      return;
    }
    if (!profile.rutaId) {
      setError("No se encontró ruta asignada al trabajador");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      await iniciarJornadaService(
        profile.empresaId,
        profile.rutaId,
        user.uid,
        profile.displayName ?? "",
        montoEntrega
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar jornada");
    } finally {
      setLoading(false);
    }
  };

  const registrarGasto = async (
    monto: number,
    descripcion: string,
    categoria: "transporte" | "alimentacion" | "otro"
  ) => {
    if (!jornadaActiva || !profile?.empresaId) return;
    try {
      setError(null);
      setLoading(true);
      await registrarGastoService(
        profile.empresaId,
        jornadaActiva.id,
        jornadaActiva.rutaId,
        monto,
        descripcion,
        categoria
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar gasto");
    } finally {
      setLoading(false);
    }
  };

  const cerrar = async () => {
    if (!jornadaActiva || !profile?.empresaId) return;
    try {
      setError(null);
      setLoading(true);
      await cerrarJornadaService(
        profile.empresaId,
        jornadaActiva.id,
        jornadaActiva.rutaId
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cerrar jornada");
    } finally {
      setLoading(false);
    }
  };

  return {
    jornadaActiva,
    movimientos,
    loading,
    error,
    iniciar,
    registrarGasto,
    cerrar,
  };
}

