"use client";

import { useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import { formatFechaDia } from "@/lib/colombia-day-bounds";
import { useRuta } from "@/hooks/useRuta";
import { FILTROS_RUTA_DIA, useRutaDia } from "@/hooks/useRutaDia";
import {
  tieneAlertaAlta,
  tieneAlertaNoPagoInformativa,
} from "@/lib/ruta-dia-prioridad";
import type { ClienteRutaGrupo, PrioridadClienteRuta } from "@/types/finanzas";

/** Semáforo: rojo = alerta alta (3+ no pagos), naranja = no pago hoy o alerta informativa, amarillo = pendiente, verde = cuota del día pagada */
export type SemaforoRuta = "rojo" | "naranja" | "amarillo" | "verde";

function grupoTieneAlertaAlta(grupo: ClienteRutaGrupo): boolean {
  return grupo.items.some((i) => tieneAlertaAlta(i.intentosFallidos));
}

function tieneAlertaNoPago(grupo: ClienteRutaGrupo): boolean {
  return grupo.items.some((i) =>
    tieneAlertaNoPagoInformativa(i.intentosFallidos)
  );
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

function getBadgeLabel(grupo: ClienteRutaGrupo, _prioridad: PrioridadClienteRuta): string {
  const allCuotaPagadaHoy =
    grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy);
  const tieneNoPagoHoy = grupo.items.some((i) => i.noPagoHoy);
  if (grupoTieneAlertaAlta(grupo)) return "Alerta alta";
  if (allCuotaPagadaHoy) return "Pagó hoy";
  if (tieneNoPagoHoy) return "No pagó hoy";
  return "Pendiente";
}

export default function TrabajadorRutaPageContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const { fechaDia, data: cajaDelDiaResumen, loading: loadingCajaDelDia, tuCajaEfectivo } =
    useTrabajadorCajaDia();
  const cajaActual = tuCajaEfectivo ?? 0;
  const [filtroExpandido, setFiltroExpandido] = useState(false);

  const {
    ruta,
    loading: loadingRuta,
    error: errorRuta,
  } = useRuta();
  const {
    clientes,
    filtro,
    setFiltro,
    busquedaNombre,
    setBusquedaNombre,
    clientesFiltrados,
    clientesFiltradosGrouped,
    loading,
    error,
    refetch,
    markVisitado,
  } = useRutaDia();

  const conteosRuta = useMemo(
    () => ({
      cobrados: clientes.filter((c) => c.cuotaPagadaHoy).length,
      noPagoHoy: clientes.filter((c) => c.noPagoHoy).length,
      pendientes: clientes.filter((c) => !c.cuotaPagadaHoy && !c.noPagoHoy).length,
      morosos: clientes.filter((c) => c.moroso).length,
    }),
    [clientes]
  );

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

  const secciones = [
    { prioridad: 1 as PrioridadClienteRuta, titulo: "URGENTE · ALERTA ALTA" },
    {
      prioridad: 2 as PrioridadClienteRuta,
      titulo: "ADVERTENCIA · SIN PAGO RECIENTE (informativo)",
    },
    { prioridad: 3 as PrioridadClienteRuta, titulo: "VENCEN HOY" },
    { prioridad: 4 as PrioridadClienteRuta, titulo: "MAÑANA" },
    { prioridad: 5 as PrioridadClienteRuta, titulo: "PRESTAMOS" },
  ];

  const handleClickCliente = useCallback(
    (grupo: ClienteRutaGrupo) => {
      markVisitado(grupo.clienteId);
      const principal = grupo.items[0];
      if (!principal) return;
      router.push(
        `/dashboard/trabajador/cobrar?clienteId=${encodeURIComponent(principal.clienteId)}&prestamoId=${encodeURIComponent(principal.prestamoId)}`
      );
    },
    [markVisitado, router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, grupo: ClienteRutaGrupo) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClickCliente(grupo);
      }
    },
    [handleClickCliente]
  );

  if (!profile || profile.role !== "trabajador") return null;

  const hoy = new Date();
  const fechaLabel = hoy.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const filtroActualLabel =
    FILTROS_RUTA_DIA.find((f) => f.id === filtro)?.label ?? "Todos";
  const filtroLabel =
    FILTROS_RUTA_DIA.find((f) => f.id === filtro)?.label?.toLowerCase() ??
    "este filtro";
  const emptySinClientes = clientes.length === 0;
  const emptyFiltro =
    !emptySinClientes && clientesFiltrados.length === 0;
  const busquedaTrim = busquedaNombre.trim();

  return (
    <div className="card ruta-dia-card">
      <header className="ruta-dia-header">
        <div>
          <h2 className="ruta-dia-title">Ruta del día</h2>
          <p className="ruta-dia-subtitle">
            {fechaLabel} · {ruta?.nombre ?? "Sin ruta"}
          </p>
        </div>
      </header>

      {errorRuta && (
        <p className="ruta-dia-error" role="alert">
          {errorRuta}
        </p>
      )}
      {loadingRuta && !ruta && (
        <p className="ruta-dia-loading">Cargando ruta...</p>
      )}

      <section className="ruta-dia-caja-card" aria-labelledby="ruta-dia-caja-heading">
        <div className="ruta-dia-caja-inner">
          <div className="ruta-dia-caja-text">
            <h3 id="ruta-dia-caja-heading" className="ruta-dia-caja-title">
              caja 
            </h3>
            <p className="ruta-dia-caja-desc">
              {formatFechaDia(cajaDelDiaResumen?.fechaDia ?? fechaDia)}
            </p>
          </div>
          <div className="ruta-dia-caja-monto-wrap">
            <span className="ruta-dia-caja-monto" aria-live="polite">
              {loadingCajaDelDia && tuCajaEfectivo == null
                ? "…"
                : formatCurrency(cajaActual)}
            </span>
            <Link href="/dashboard/trabajador/caja-del-dia" className="ruta-dia-caja-link">
              Ver detalles
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <div className="ruta-dia-error-wrap" role="alert">
          <p className="ruta-dia-error">{error}</p>
          <button
            type="button"
            className="ruta-dia-refresh-btn"
            onClick={refetch}
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="ruta-dia-toolbar">
        <div className="ruta-dia-search-field">
          <span className="ruta-dia-search-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            id="ruta-dia-buscador"
            className="ruta-dia-search-input"
            type="search"
            value={busquedaNombre}
            onChange={(e) => setBusquedaNombre(e.target.value)}
            placeholder="Buscar cliente por nombre..."
            aria-label="Buscar cliente por nombre"
            autoComplete="off"
          />
          {busquedaTrim ? (
            <button
              type="button"
              className="ruta-dia-search-clear"
              onClick={() => setBusquedaNombre("")}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          ) : null}
        </div>
        {busquedaTrim && !loading && !emptySinClientes ? (
          <p className="ruta-dia-search-hint">
            {clientesFiltradosGrouped.length} cliente
            {clientesFiltradosGrouped.length !== 1 ? "s" : ""} encontrado
            {clientesFiltradosGrouped.length !== 1 ? "s" : ""}
          </p>
        ) : null}
        <div className="ruta-dia-filtros-wrap">
          {!filtroExpandido ? (
            <button
              type="button"
              className="ruta-dia-filtro-trigger"
              onClick={() => setFiltroExpandido(true)}
              aria-expanded={false}
              aria-haspopup="listbox"
              aria-label={`Filtro: ${filtroActualLabel}. Pulsar para ver opciones`}
            >
              <span className="ruta-dia-filtro-trigger-label">{filtroActualLabel}</span>
              <span className="ruta-dia-filtro-trigger-icon" aria-hidden> &gt;</span>
            </button>
          ) : (
            <div className="ruta-dia-filtros" role="group" aria-label="Opciones de filtro">
              {FILTROS_RUTA_DIA.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`ruta-dia-chip ${filtro === f.id ? "ruta-dia-chip-active" : ""}`}
                  onClick={() => {
                    setFiltro(f.id);
                    setFiltroExpandido(false);
                  }}
                  aria-pressed={filtro === f.id}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="ruta-dia-loading">Cargando clientes...</p>
      ) : emptySinClientes ? (
        <p className="ruta-dia-empty ruta-dia-empty-no-ruta">
          No tienes clientes en tu ruta.
        </p>
      ) : emptyFiltro ? (
        <p className="ruta-dia-empty">
          {busquedaTrim
            ? `No hay clientes que coincidan con «${busquedaTrim}».`
            : `Ningún cliente coincide con ${filtroLabel}.`}
        </p>
      ) : (
        <div className="ruta-dia-list">
          {secciones.map(({ prioridad, titulo }) => {
            const list = gruposPorPrioridad[prioridad] ?? [];
            if (list.length === 0) return null;
            return (
              <section
                key={prioridad}
                className="ruta-dia-section"
                aria-label={titulo}
              >
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
                    const badgeLabel = getBadgeLabel(grupo, prioridad);
                    const semaforo = getSemaforo(grupo);
                    const subtituloParts: string[] = [];
                    if (grupo.cantidadPrestamos > 1) {
                      subtituloParts.push(
                        `${grupo.cantidadPrestamos} préstamos`
                      );
                    }
                    if (grupo.diasVencidosMax > 0) {
                      subtituloParts.push(
                        `${grupo.diasVencidosMax} días vencidos`
                      );
                    }
                    const allCuotaPagada =
                      grupo.items.length > 0 &&
                      grupo.items.every((i) => i.cuotaPagadaHoy);
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
                        onClick={() => handleClickCliente(grupo)}
                        onKeyDown={(e) => handleKeyDown(e, grupo)}
                        aria-label={`${grupo.clienteNombre}, ${getSemaforoLabel(semaforo)}. Saldo a cobrar ahora ${formatCurrency(grupo.items[0]?.monto ?? 0)}${grupo.cantidadPrestamos > 1 ? `; total ${grupo.cantidadPrestamos} préstamos ${formatCurrency(grupo.totalMonto)}` : ""}.${ariaMoroso} ${grupo.visitado ? "Visitado" : ""}`}
                      >
                        <span
                          className="ruta-dia-semaforo-wrap"
                          title={getSemaforoLabel(semaforo)}
                          aria-hidden
                        >
                          <span
                            className={`ruta-dia-semaforo ruta-dia-semaforo-${semaforo}`}
                          />
                          {semaforo === "naranja" && (
                            <span className="ruta-dia-semaforo-warn-icon">⚠</span>
                          )}
                        </span>
                        <div
                          className={`ruta-dia-avatar prioridad-${prioridad}`}
                        >
                          <span>{initials || "?"}</span>
                          {grupo.visitado && (
                            <span
                              className="ruta-dia-avatar-check"
                              aria-hidden
                            />
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
                            <span className="ruta-dia-item-nombre">
                              {grupo.clienteNombre}
                            </span>
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
                            <span
                              className={`ruta-dia-badge estado-${estadoFirst}`}
                            >
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
      )}

      <footer className="ruta-dia-footer">
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Cobrados</span>
          <span className="ruta-dia-footer-value ruta-dia-footer-value-green">
            {conteosRuta.cobrados}
          </span>
        </div>
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">No pagaron hoy</span>
          <span className="ruta-dia-footer-value">{conteosRuta.noPagoHoy}</span>
        </div>
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Pendientes</span>
          <span className="ruta-dia-footer-value">{conteosRuta.pendientes}</span>
        </div>
      </footer>
    </div>
  );
}
