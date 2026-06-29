"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  getCapital,
  type CapitalHistorialEntry,
  type CapitalResponse,
} from "@/lib/capital";
import { computeCapitalEmpresa } from "@/lib/capital-formulas";
import {
  EMPRESAS_COLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_CAJA_EMPRESA_DOC,
} from "@/lib/empresas-db";

export type { CapitalHistorialEntry, CapitalResponse };

export function useCapitalJefe() {
  const { user, profile } = useAuth();
  const [capital, setCapital] = useState<CapitalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cajaEmpresaRT, setCajaEmpresaRT] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!user || !profile) return;
    if (profile.role !== "jefe") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const data = await getCapital(token);
      setCapital(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el capital");
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!db || !user || profile?.role !== "jefe") return;
    const jefeUid = profile.uid;

    const ref = doc(
      db,
      EMPRESAS_COLLECTION,
      jefeUid,
      CAPITAL_SUBCOLLECTION,
      CAPITAL_CAJA_EMPRESA_DOC
    );

    let prevCaja: number | undefined;

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const caja = snap.data()?.cajaEmpresa;
        const next = typeof caja === "number" ? caja : null;
        setCajaEmpresaRT(next);
        // Re-sincroniza HTTP solo cuando el valor cambia (no en el primer disparo)
        if (next !== null && prevCaja !== undefined && next !== prevCaja) {
          void reload();
        }
        prevCaja = next ?? undefined;
      },
      (err) => {
        console.warn("[useCapitalJefe] onSnapshot cajaEmpresa:", err);
      }
    );
    return unsub;
  }, [user?.uid, profile?.role, profile?.uid, reload]);

  const sumaCapitalAdmins =
    capital?.sumaCapitalAdmins ?? capital?.capitalAsignadoAdmins ?? 0;
  const cajaEmpresa = cajaEmpresaRT ?? capital?.cajaEmpresa ?? 0;
  const monto =
    cajaEmpresaRT != null
      ? computeCapitalEmpresa(cajaEmpresa, sumaCapitalAdmins)
      : capital?.capitalEmpresa ?? capital?.capitalTotal ?? capital?.monto ?? 0;
  const historial = capital?.historial ?? [];

  return {
    capital,
    setCapital,
    loading,
    error,
    reload,
    monto,
    cajaEmpresa,
    sumaCapitalAdmins,
    historial,
  };
}
