"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useJornadaDiaCache } from "@/hooks/useJornadaDiaCache";

function formatMonto(value: number): string {
  return `$ ${Math.trunc(value).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatFecha(fechaDia: string): string {
  const d = new Date(`${fechaDia}T12:00:00`);
  const raw = d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function TrabajadorInicioJornada() {
  const { profile } = useAuth();
  const { porRuta, fechaDia, loading, error } = useJornadaDiaCache();

  const jornada = useMemo(() => {
    const rutaId = profile?.rutaId?.trim();
    if (rutaId && porRuta[rutaId]) return porRuta[rutaId];
    const lista = Object.values(porRuta);
    return lista[0] ?? null;
  }, [porRuta, profile?.rutaId]);

  const valor = (n: number | undefined) => {
    if (error) return "No disponible";
    if (loading && jornada == null) return "Cargando…";
    return formatMonto(n ?? 0);
  };

  return (
    <section className="trabajador-inicio-jornada" aria-label="Jornada de cobro">
      <p className="trabajador-inicio-date">{formatFecha(fechaDia)}</p>
      <div className="trabajador-inicio-jornada-card" aria-label="Saldo por recoger hoy y recogido">
        <div className="trabajador-inicio-jornada-par">
          <span className="trabajador-inicio-caja-label">Saldo por recoger hoy</span>
          <span
            className={`trabajador-inicio-caja-valor ${
              error || (loading && jornada == null) ? "trabajador-inicio-caja-valor-muted" : ""
            }`}
          >
            {valor(jornada?.montoARecoger)}
          </span>
        </div>
        <div className="trabajador-inicio-jornada-par">
          <span className="trabajador-inicio-caja-label">Recogido</span>
          <span
            className={`trabajador-inicio-caja-valor ${
              error || (loading && jornada == null) ? "trabajador-inicio-caja-valor-muted" : ""
            }`}
          >
            {valor(jornada?.montoRecogido)}
          </span>
        </div>
      </div>
    </section>
  );
}
