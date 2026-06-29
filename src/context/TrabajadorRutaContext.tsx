"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, doc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { EMPRESAS_COLLECTION, RUTAS_SUBCOLLECTION } from "@/lib/empresas-db";
import { useDeferredMount } from "@/hooks/useDeferredMount";

import type { RutaFinanciera } from "@/types/finanzas";

export interface TrabajadorRutaContextValue {
  ruta: RutaFinanciera | null;
  loading: boolean;
  error: string | null;
}

const TrabajadorRutaContext = createContext<TrabajadorRutaContextValue | null>(null);

export function TrabajadorRutaProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const subscriptionsReady = useDeferredMount(50);
  const [state, setState] = useState<TrabajadorRutaContextValue>({
    ruta: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!subscriptionsReady) return;
    if (!db) {
      setState({
        ruta: null,
        loading: false,
        error: "Firestore no está configurado en el cliente",
      });
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

        if (!rutaId) {
          const [snap1, snap2] = await Promise.all([
            getDocs(query(rutasCol, where("empleadoId", "==", currentUser.uid))),
            getDocs(query(rutasCol, where("empleadosIds", "array-contains", currentUser.uid))),
          ]);
          rutaId = snap1.docs[0]?.id ?? snap2.docs[0]?.id ?? null;
        }

        if (!rutaId) {
          if (!cancelled) {
            setState({
              ruta: null,
              loading: false,
              error: "No se encontró una ruta asignada al trabajador",
            });
          }
          return;
        }

        const rutaRef = doc(rutasCol, rutaId);
        unsubscribe = onSnapshot(
          rutaRef,
          (snap) => {
            if (!snap.exists()) {
              setState({
                ruta: null,
                loading: false,
                error: "Ruta no encontrada",
              });
              return;
            }
            const data = snap.data() as Record<string, unknown>;
            const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
            const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
            const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
            const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;
            const capitalTotal =
              typeof data.capitalTotal === "number"
                ? data.capitalTotal
                : computeCapitalTotalRutaDesdeSaldos({
                    cajaRuta,
                    cajasEmpleados,
                    inversiones,
                    perdidas,
                  });

            setState({
              ruta: {
                id: snap.id,
                nombre: (data.nombre as string) ?? "",
                zonaId: (data.zonaId as string) ?? "",
                empleadosIds: Array.isArray(data.empleadosIds) ? (data.empleadosIds as string[]) : [],
                adminId: (data.adminId as string) ?? "",
                cajaRuta,
                cajasEmpleados,
                inversiones,
                capitalTotal,
                ganancias: typeof data.ganancias === "number" ? data.ganancias : 0,
                gastos: typeof data.gastos === "number" ? data.gastos : 0,
                perdidas,
                fechaCreacion: data.fechaCreacion as RutaFinanciera["fechaCreacion"],
                ultimaActualizacion: data.ultimaActualizacion as RutaFinanciera["ultimaActualizacion"],
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

    void resolveRutaAndSubscribe();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, profile, subscriptionsReady]);

  const value = useMemo(() => state, [state]);

  return <TrabajadorRutaContext.Provider value={value}>{children}</TrabajadorRutaContext.Provider>;
}

export function useTrabajadorRuta(): TrabajadorRutaContextValue {
  const ctx = useContext(TrabajadorRutaContext);
  if (!ctx) {
    throw new Error("useTrabajadorRuta debe usarse dentro de TrabajadorRutaProvider");
  }
  return ctx;
}

/** Lectura opcional sin lanzar (p. ej. fuera del árbol del trabajador). */
export function useTrabajadorRutaOptional(): TrabajadorRutaContextValue | null {
  return useContext(TrabajadorRutaContext);
}
