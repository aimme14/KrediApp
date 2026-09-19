"use client";

import { useMemo, useCallback } from "react";
import {
  tieneAlertaAlta,
  tieneAlertaNoPagoInformativa,
} from "@/lib/ruta-dia-prioridad";
import type { ClienteRutaGrupo, PrioridadClienteRuta } from "@/types/finanzas";

export type SemaforoRuta = "rojo" | "naranja" | "amarillo" | "verde";

function grupoTieneAlertaAlta(grupo: ClienteRutaGrupo): boolean {
  return grupo.items.some((i) => tieneAlertaAlta(i.intentosFallidos));
}

function tieneAlertaNoPago(grupo: ClienteRutaGrupo): boolean {
  return grupo.items.some((i) => tieneAlertaNoPagoInformativa(i.intentosFallidos));
}

function getSemaforo(grupo: ClienteRutaGrupo): SemaforoRuta {
  const allCuotaPagadaHoy =
    grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy);
  const tieneNoPagoHoy = grupo.items.some((i) => i.noPagoHoy);
  if (grupoTieneAlertaAlta(grupo)) return "rojo";
  if (tieneNoPagoHoy) return "naranja";
  if (tieneAlertaNoPago(grupo)) return "naranja";
  if (allCuotaPagadaHoy) return "verde";
  return "amarillo";
}

function getSemaforoLabel(semaforo: SemaforoRuta): string {
  switch (semaforo) {
    case "rojo":
      return "Alerta alta";
    case "naranja":
      return "Sin pago reciente (informativo)";
    case "amarillo":
      return "Pendiente por cobrar";
    case "verde":
      return "Cuota del día pagada";
    default:
      return "";
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function getBadgeLabel(grupo: ClienteRutaGrupo): string {
  const allCuotaPagadaHoy =
    grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy);
  const tieneNoPagoHoy = grupo.items.some((i) => i.noPagoHoy);
  if (grupoTieneAlertaAlta(grupo)) return "Alerta alta";
  if (allCuotaPagadaHoy) return "Pagó hoy";
  if (tieneNoPagoHoy) return "No pagó hoy";
  return "Pendiente";
}

const SECCIONES: { prioridad: PrioridadClienteRuta; titulo: string }[] = [
  { prioridad: 1, titulo: "URGENTE · ALERTA ALTA" },
  { prioridad: 2, titulo: "ADVERTENCIA · SIN PAGO RECIENTE (informativo)" },
  { prioridad: 3, titulo: "VENCEN HOY" },
  { prioridad: 4, titulo: "MAÑANA" },
  { prioridad: 5, titulo: "PRESTAMOS" },
];

type Props = {
  clientesFiltradosGrouped: ClienteRutaGrupo[];
  loading: boolean;
  emptySinClientes: boolean;
  emptyFiltro: boolean;
  busquedaTrim: string;
  filtroLabel: string;
  emptySinClientesMsg: string;
  onSelectGrupo: (grupo: ClienteRutaGrupo) => void;
};

export function RutaDiaClientesLista({
  clientesFiltradosGrouped,
  loading,
  emptySinClientes,
  emptyFiltro,
  busquedaTrim,
  filtroLabel,
  emptySinClientesMsg,
  onSelectGrupo,
}: Props) {
  const gruposPorPrioridad = useMemo(() => {
    const grupos: Record<number, ClienteRutaGrupo[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
    };
    for (const g of clientesFiltradosGrouped) {
      grupos[g.prioridadMax].push(g);
    }
    return grupos;
  }, [clientesFiltradosGrouped]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, grupo: ClienteRutaGrupo) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectGrupo(grupo);
      }
    },
    [onSelectGrupo]
  );

  if (loading) {
    return <p className="ruta-dia-loading">Cargando clientes...</p>;
  }

  if (emptySinClientes) {
    return <p className="ruta-dia-empty ruta-dia-empty-no-ruta">{emptySinClientesMsg}</p>;
  }

  if (emptyFiltro) {
    return (
      <p className="ruta-dia-empty">
        {busquedaTrim
          ? `No hay clientes que coincidan con «${busquedaTrim}».`
          : `Ningún cliente coincide con ${filtroLabel}.`}
      </p>
    );
  }

  return (
    <>
      <div className="ruta-dia-list">
        {SECCIONES.map(({ prioridad, titulo }) => {
          const list = gruposPorPrioridad[prioridad] ?? [];
          if (list.length === 0) return null;
          return (
            <section key={prioridad} className="ruta-dia-section" aria-label={titulo}>
              <h3 className={`ruta-dia-section-title ruta-dia-section-${prioridad}`}>
                {titulo}
              </h3>
              <ul className="ruta-dia-section-list">
                {list.map((grupo) => {
                  const initials = grupo.clienteNombre
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join("");
                  const badgeLabel = getBadgeLabel(grupo);
                  const semaforo = getSemaforo(grupo);
                  const subtituloParts: string[] = [];
                  if (grupo.cantidadPrestamos > 1) {
                    subtituloParts.push(`${grupo.cantidadPrestamos} préstamos`);
                  }
                  if (grupo.diasVencidosMax > 0) {
                    subtituloParts.push(`${grupo.diasVencidosMax} días vencidos`);
                  }
                  const allCuotaPagada =
                    grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy);
                  const estadoFirst = allCuotaPagada
                    ? "pagada"
                    : grupoTieneAlertaAlta(grupo)
                      ? "alerta"
                      : tieneAlertaNoPago(grupo)
                        ? "alerta"
                        : (grupo.items[0]?.estado?.toLowerCase() ?? "activo");

                  const ariaMoroso = grupo.moroso
                    ? " Cliente marcado como moroso por el administrador."
                    : "";
                  return (
                    <li
                      key={grupo.clienteId}
                      className={`ruta-dia-item ruta-dia-item-semaforo-${semaforo} ${grupo.visitado ? "ruta-dia-item-visitado" : ""} ${grupo.moroso ? "ruta-dia-item-moroso" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectGrupo(grupo)}
                      onKeyDown={(e) => handleKeyDown(e, grupo)}
                      aria-label={`${grupo.clienteNombre}, ${getSemaforoLabel(semaforo)}. Saldo a cobrar ahora ${formatCurrency(grupo.items[0]?.monto ?? 0)}${grupo.cantidadPrestamos > 1 ? `; total ${grupo.cantidadPrestamos} préstamos ${formatCurrency(grupo.totalMonto)}` : ""}.${ariaMoroso} ${grupo.visitado ? "Visitado" : ""}`}
                    >
                      <span
                        className="ruta-dia-semaforo-wrap"
                        title={getSemaforoLabel(semaforo)}
                        aria-hidden
                      >
                        <span className={`ruta-dia-semaforo ruta-dia-semaforo-${semaforo}`} />
                        {semaforo === "naranja" && (
                          <span className="ruta-dia-semaforo-warn-icon">⚠</span>
                        )}
                      </span>
                      <div className={`ruta-dia-avatar prioridad-${prioridad}`}>
                        <span>{initials || "?"}</span>
                        {grupo.visitado && (
                          <span className="ruta-dia-avatar-check" aria-hidden />
                        )}
                      </div>
                      <div className="ruta-dia-item-main">
                        {grupo.moroso ? (
                          <div className="ruta-dia-moroso-banner" role="status">
                            <span className="ruta-dia-moroso-banner-icon" aria-hidden>
                              ⚠
                            </span>
                            <span>Cliente moroso</span>
                          </div>
                        ) : null}
                        <div className="ruta-dia-item-row">
                          <span className="ruta-dia-item-nombre">{grupo.clienteNombre}</span>
                          <span className="ruta-dia-item-monto">
                            {formatCurrency(grupo.items[0]?.monto ?? 0)}
                            {grupo.cantidadPrestamos > 1 && (
                              <span className="ruta-dia-item-cuotas">
                                {" "}
                                · total {formatCurrency(grupo.totalMonto)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="ruta-dia-item-row ruta-dia-item-secondary">
                          <span className="ruta-dia-item-sub">
                            {subtituloParts.join(" · ") || grupo.zona || "—"}
                          </span>
                          <span className={`ruta-dia-badge estado-${estadoFirst}`}>
                            {badgeLabel}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
