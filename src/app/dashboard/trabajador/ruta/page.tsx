"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRuta } from "@/hooks/useRuta";
import { useRutaDia } from "@/hooks/useRutaDia";
import type { ClienteRutaGrupo, PrioridadClienteRuta } from "@/types/finanzas";

/** Semáforo: rojo = mora, amarillo = pendiente por cobrar (cuota del día), verde = ya pagó la cuota del día */
export type SemaforoRuta = "rojo" | "amarillo" | "verde";

function getSemaforo(grupo: ClienteRutaGrupo): SemaforoRuta {
  const hasMora = grupo.items.some((i) => i.estado === "mora");
  const allCuotaPagadaHoy =
    grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy);
  if (hasMora) return "rojo";
  if (allCuotaPagadaHoy) return "verde";
  return "amarillo";
}

function getSemaforoLabel(semaforo: SemaforoRuta): string {
  switch (semaforo) {
    case "rojo":
      return "En mora";
    case "amarillo":
      return "Pendiente por cobrar";
    case "verde":
      return "Cuota del día pagada";
    default:
      return "";
  }
}

const filtros: {
  id: "todos" | "mora" | "hoy" | "pendientes" | "cobrados";
  label: string;
}[] = [
  { id: "todos", label: "Todos" },
  { id: "mora", label: "En mora" },
  { id: "hoy", label: "Vencen hoy" },
  { id: "pendientes", label: "Pendientes" },
  { id: "cobrados", label: "Cobrados" },
];

function formatCurrency(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function getBadgeLabel(
  grupo: ClienteRutaGrupo,
  prioridad: PrioridadClienteRuta
): string {
  const hasMora = grupo.items.some((i) => i.estado === "mora");
  const allCuotaPagadaHoy =
    grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy);
  if (hasMora) return "Mora";
  if (allCuotaPagadaHoy) return "Pagada hoy";
  if (prioridad === 2) return "Hoy";
  if (prioridad === 3) return "Mañana";
  return "Pronto";
}

export default function RutaDelDiaPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const {
    ruta,
    loading: loadingRuta,
    error: errorRuta,
  } = useRuta();
  const {
    clientes,
    filtro,
    setFiltro,
    clientesFiltrados,
    clientesFiltradosGrouped,
    loading,
    error,
    refetch,
    markVisitado,
  } = useRutaDia();

  const totalClientesUnicos = useMemo(
    () => new Set(clientes.map((c) => c.clienteId)).size,
    [clientes]
  );
  /** Cuotas/préstamos con pago registrado hoy (semáforo verde) */
  const totalCobrados = clientes.filter((c) => c.cuotaPagadaHoy).length;
  /** Total cobrado hoy: no disponible sin API; se deja en 0 */
  const totalCobrado = 0;

  const gruposPorPrioridad = useMemo(() => {
    const grupos: Record<number, ClienteRutaGrupo[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
    };
    for (const g of clientesFiltradosGrouped) {
      grupos[g.prioridadMax].push(g);
    }
    return grupos;
  }, [clientesFiltradosGrouped]);

  const secciones = [
    { prioridad: 1 as PrioridadClienteRuta, titulo: "URGENTE · EN MORA" },
    { prioridad: 2 as PrioridadClienteRuta, titulo: "VENCEN HOY" },
    { prioridad: 3 as PrioridadClienteRuta, titulo: "MAÑANA" },
    { prioridad: 4 as PrioridadClienteRuta, titulo: "ESTA SEMANA" },
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

  const filtroLabel =
    filtros.find((f) => f.id === filtro)?.label?.toLowerCase() ?? "este filtro";
  const emptySinClientes = clientes.length === 0;
  const emptyFiltro =
    !emptySinClientes && clientesFiltrados.length === 0;

  return (
    <div className="card ruta-dia-card">
      <header className="ruta-dia-header">
        <div>
          <h2 className="ruta-dia-title">Ruta del día</h2>
          <p className="ruta-dia-subtitle">
            {fechaLabel} · {ruta?.nombre ?? "Sin ruta"}
          </p>
        </div>
        <div className="ruta-dia-summary">
          <span>{totalClientesUnicos} clientes</span>
          <span>{formatCurrency(totalCobrado)} cobrado</span>
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
        <div className="ruta-dia-filtros" role="group" aria-label="Filtrar lista">
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`ruta-dia-chip ${filtro === f.id ? "ruta-dia-chip-active" : ""}`}
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ruta-dia-refresh-btn"
          onClick={refetch}
          disabled={loading}
          aria-label="Actualizar lista de la ruta"
        >
          Actualizar
        </button>
      </div>

      {loading ? (
        <p className="ruta-dia-loading">Cargando clientes...</p>
      ) : emptySinClientes ? (
        <p className="ruta-dia-empty ruta-dia-empty-no-ruta">
          No tienes clientes en tu ruta.
        </p>
      ) : emptyFiltro ? (
        <p className="ruta-dia-empty">
          Ningún cliente coincide con {filtroLabel}.
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
                        `${grupo.cantidadPrestamos} cuotas`
                      );
                    }
                    if (grupo.diasMoraMax > 0) {
                      subtituloParts.push(
                        `${grupo.diasMoraMax} días de mora`
                      );
                    }
                    const estadoFirst =
                      (grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy))
                        ? "pagada"
                        : (grupo.items[0]?.estado?.toLowerCase() ?? "activo");

                    return (
                      <li
                        key={grupo.clienteId}
                        className={`ruta-dia-item ruta-dia-item-semaforo-${semaforo} ${grupo.visitado ? "ruta-dia-item-visitado" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleClickCliente(grupo)}
                        onKeyDown={(e) => handleKeyDown(e, grupo)}
                        aria-label={`${grupo.clienteNombre}, ${getSemaforoLabel(semaforo)}. ${formatCurrency(grupo.totalMonto)}${grupo.cantidadPrestamos > 1 ? `, ${grupo.cantidadPrestamos} cuotas` : ""}. ${grupo.visitado ? "Visitado" : ""}`}
                      >
                        <span
                          className={`ruta-dia-semaforo ruta-dia-semaforo-${semaforo}`}
                          title={getSemaforoLabel(semaforo)}
                          aria-hidden
                        />
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
                          <div className="ruta-dia-item-row">
                            <span className="ruta-dia-item-nombre">
                              {grupo.clienteNombre}
                            </span>
                            <span className="ruta-dia-item-monto">
                              {formatCurrency(grupo.totalMonto)}
                              {grupo.cantidadPrestamos > 1 && (
                                <span className="ruta-dia-item-cuotas">
                                  {" "}
                                  · {grupo.cantidadPrestamos} cuotas
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
          <span className="ruta-dia-footer-value">{totalCobrados}</span>
        </div>
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Pendientes</span>
          <span className="ruta-dia-footer-value">
            {clientes.length - totalCobrados}
          </span>
        </div>
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Total cobrado</span>
          <span className="ruta-dia-footer-value">
            {formatCurrency(totalCobrado)}
          </span>
        </div>
      </footer>
    </div>
  );
}
