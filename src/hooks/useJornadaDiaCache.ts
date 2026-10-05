"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { EMPRESAS_COLLECTION, JORNADA_DIA_SUBCOLLECTION } from "@/lib/empresas-db";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import { jornadaDiaDocId, montosJornadaDesdeDatos, type JornadaMontos } from "@/lib/jornada-dia";

export type JornadaRutaVista = JornadaMontos & { rutaId: string };

function vistaDesdeFila(row: Record<string, unknown>): JornadaRutaVista | null {
  const rutaId = typeof row.rutaId === "string" ? row.rutaId : "";
  if (!rutaId) return null;
  return { rutaId, ...montosJornadaDesdeDatos(row) };
}

/**
 * Lee la caché de la jornada. El API la crea si el día todavía no tiene documento;
 * el listener refleja los cobros sin volver a sumar las cuotas.
 */
export function useJornadaDiaCache() {
  const { user, profile } = useAuth();
  const [porRuta, setPorRuta] = useState<Record<string, JornadaRutaVista>>({});
  const [fechaDia, setFechaDia] = useState(() => fechaDiaColombiaHoy());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const hoy = fechaDiaColombiaHoy();
      setFechaDia((prev) => {
        if (prev !== hoy) {
          setTick((n) => n + 1);
          return hoy;
        }
        return prev;
      });
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const hoy = fechaDiaColombiaHoy();
      setFechaDia((prev) => {
        if (prev !== hoy) {
          setTick((n) => n + 1);
          return hoy;
        }
        return prev;
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!user || !profile?.empresaId) {
      setPorRuta({});
      setLoading(false);
      return;
    }

    const empresaId = profile.empresaId;
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/empresa/jornada-dia", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          fechaDia?: string;
          rutas?: Record<string, unknown>[];
        };
        if (!res.ok) throw new Error(body.error ?? "No se pudo cargar la jornada");
        if (cancelled) return;

        const fecha = typeof body.fechaDia === "string" ? body.fechaDia : fechaDiaColombiaHoy();
        setFechaDia(fecha);
        const next: Record<string, JornadaRutaVista> = {};
        for (const row of body.rutas ?? []) {
          const vista = vistaDesdeFila(row);
          if (vista) next[vista.rutaId] = vista;
        }
        setPorRuta(next);

        if (!db) return;
        for (const rutaId of Object.keys(next)) {
          const ref = doc(
            db,
            EMPRESAS_COLLECTION,
            empresaId,
            JORNADA_DIA_SUBCOLLECTION,
            jornadaDiaDocId(fecha, rutaId)
          );
          const unsub = onSnapshot(
            ref,
            (snap) => {
              if (!snap.exists()) return;
              const vista = vistaDesdeFila({
                rutaId,
                ...(snap.data() as Record<string, unknown>),
              });
              if (!vista) return;
              setPorRuta((prev) => ({ ...prev, [rutaId]: vista }));
            },
            () => {
              /* La respuesta del API sigue en pantalla si la regla aún no está desplegada. */
            }
          );
          if (cancelled) unsub();
          else unsubs.push(unsub);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "No se pudo cargar la jornada");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      for (const unsub of unsubs) unsub();
    };
  }, [user, profile?.empresaId, tick]);

  return { porRuta, fechaDia, loading, error };
}
