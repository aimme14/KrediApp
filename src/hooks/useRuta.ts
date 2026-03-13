"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { EMPRESAS_COLLECTION, RUTAS_SUBCOLLECTION } from "@/lib/empresas-db";
import type { RutaFinanciera } from "@/types/finanzas";

interface UseRutaState {
  ruta: RutaFinanciera | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook para suscribirse en tiempo real a la ruta asignada
 * al trabajador actual (empleado). Usa:
 * - profile.empresaId
 * - profile.rutaId (si existe), o
 * - búsqueda por empleadoId/empleadosIds.
 */
export function useRuta(): UseRutaState {
  const { user, profile } = useAuth();
  const [state, setState] = useState<UseRutaState>({
    ruta: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!db) {
      setState((s) => ({
        ...s,
        loading: false,
        error: "Firestore no está configurado en el cliente",
      }));
      return;
    }
    if (!user || !profile || profile.role !== "trabajador" || !profile.empresaId) {
      setState({ ruta: null, loading: false, error: null });
      return;
    }

    const firestore = db;
    const currentUser = user;
    const currentProfile = profile;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function resolveRutaAndSubscribe() {
      try {
        setState((s) => ({ ...s, loading: true, error: null }));
        const empresaId = currentProfile.empresaId!;
        const rutasCol = collection(firestore, EMPRESAS_COLLECTION, empresaId, RUTAS_SUBCOLLECTION);

        let rutaId: string | null = currentProfile.rutaId ?? null;

        // Fallback 1: rutas con empleadoId (modelo antiguo)
        if (!rutaId) {
          const q1 = query(rutasCol, where("empleadoId", "==", currentUser.uid));
          const snap1 = await getDocs(q1);
          if (!snap1.empty) {
            rutaId = snap1.docs[0].id;
          }
        }

        // Fallback 2: rutas con empleadosIds (nuevo modelo)
        if (!rutaId) {
          const q2 = query(rutasCol, where("empleadosIds", "array-contains", currentUser.uid));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            rutaId = snap2.docs[0].id;
          }
        }

        if (!rutaId) {
          if (!cancelled) {
            setState({ ruta: null, loading: false, error: "No se encontró una ruta asignada al trabajador" });
          }
          return;
        }

        const rutaRef = doc(rutasCol, rutaId);
        unsubscribe = onSnapshot(
          rutaRef,
          (snap) => {
            if (!snap.exists()) {
              setState({ ruta: null, loading: false, error: "Ruta no encontrada" });
              return;
            }
            const data = snap.data() as any;
            const cajaRuta = data.cajaRuta ?? 0;
            const cajasEmpleados = data.cajasEmpleados ?? 0;
            const inversiones = data.inversiones ?? 0;
            const capitalTotal = data.capitalTotal ?? cajaRuta + cajasEmpleados + inversiones;

            setState({
              ruta: {
                id: snap.id,
                nombre: data.nombre ?? "",
                zonaId: data.zonaId ?? "",
                empleadosIds: Array.isArray(data.empleadosIds) ? (data.empleadosIds as string[]) : [],
                adminId: data.adminId ?? "",
                cajaRuta,
                cajasEmpleados,
                inversiones,
                capitalTotal,
                ganancias: data.ganancias ?? 0,
                gastos: data.gastos ?? 0,
                perdidas: data.perdidas ?? 0,
                fechaCreacion: data.fechaCreacion,
                ultimaActualizacion: data.ultimaActualizacion,
              },
              loading: false,
              error: null,
            });
          },
          (err) => {
            setState((s) => ({
              ...s,
              loading: false,
              error: err.message ?? "Error al suscribirse a la ruta",
            }));
          }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al obtener la ruta";
        if (!cancelled) {
          setState({ ruta: null, loading: false, error: msg });
        }
      }
    }

    resolveRutaAndSubscribe();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, profile]);

  return state;
}

