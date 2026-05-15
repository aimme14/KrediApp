"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getCapital,
  type CapitalHistorialEntry,
  type CapitalResponse,
} from "@/lib/capital";

export type { CapitalHistorialEntry, CapitalResponse };

export function useCapitalJefe() {
  const { user, profile } = useAuth();
  const [capital, setCapital] = useState<CapitalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const monto =
    capital?.capitalEmpresa ?? capital?.capitalTotal ?? capital?.monto ?? 0;
  const cajaEmpresa = capital?.cajaEmpresa ?? 0;
  const sumaCapitalAdmins =
    capital?.sumaCapitalAdmins ?? capital?.capitalAsignadoAdmins ?? 0;
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
