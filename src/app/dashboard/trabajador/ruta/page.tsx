"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import {
  getCobrosDelDiaEmpleado,
  type CobrosDelDiaEmpleadoResponse,
} from "@/lib/empresa-api";
import { tuCajaDelDiaDesdeTotales } from "@/lib/tu-caja-del-dia";
import { useRuta } from "@/hooks/useRuta";
import { NO_PAGOS_PARA_MORA, useRutaDia } from "@/hooks/useRutaDia";
import type { ClienteRutaGrupo, PrioridadClienteRuta } from "@/types/finanzas";

/** Semáforo: rojo = mora, naranja = 1–2 no pagos, amarillo = pendiente, verde = cuota del día pagada */
export type SemaforoRuta = "rojo" | "naranja" | "amarillo" | "verde";

function tieneAlertaNoPago(grupo: ClienteRutaGrupo): boolean {
  return grupo.items.some(
    (i) =>
      i.estado === "activo" &&
      i.intentosFallidos >= 1 &&
      i.intentosFallidos < NO_PAGOS_PARA_MORA
  );
}

function getSemaforo(grupo: ClienteRutaGrupo): SemaforoRuta {
  const hasMora = grupo.items.some((i) => i.estado === "mora");
  const allCuotaPagadaHoy =
    grupo.items.length > 0 && grupo.items.every((i) => i.cuotaPagadaHoy);
  if (hasMora) return "rojo";
  if (tieneAlertaNoPago(grupo)) return "naranja";
  if (allCuotaPagadaHoy) return "verde";
  return "amarillo";
}

function getSemaforoLabel(semaforo: SemaforoRuta): string {
  switch (semaforo) {
    case "rojo":
      return "En mora";
    case "naranja":
      return "Sin pago (1 o 2 veces)";
    case "amarillo":
      return "Pendiente por cobrar";
    case "verde":
      return "Cuota del día pagada";
    default:
      return "";
  }
}

const FILTROS_OPCIONES: {
  id: "todos" | "mora" | "pendientes" | "cobrados";
  label: string;
}[] = [
  { id: "todos", label: "Todos" },
  { id: "mora", label: "En mora" },
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
  if (tieneAlertaNoPago(grupo)) return "Alerta";
  if (allCuotaPagadaHoy) return "Pagada hoy";
  if (prioridad === 3) return "Hoy";
  if (prioridad === 4) return "Mañana";
  return "Pronto";
}

export default function RutaDelDiaPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [cajaDelDiaResumen, setCajaDelDiaResumen] =
    useState<CobrosDelDiaEmpleadoResponse | null>(null);
  const [loadingCajaDelDia, setLoadingCajaDelDia] = useState(true);
  const [filtroExpandido, setFiltroExpandido] = useState(false);

  useEffect(() => {
    if (!user || profile?.role !== "trabajador") {
      setCajaDelDiaResumen(null);
      setLoadingCajaDelDia(false);
      return;
    }
    let cancelled = false;
    setLoadingCajaDelDia(true);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const data = await getCobrosDelDiaEmpleado(token, fechaDiaColombiaHoy());
        if (!cancelled) setCajaDelDiaResumen(data);
      } catch {
        if (!cancelled) setCajaDelDiaResumen(null);
      } finally {
        if (!cancelled) setLoadingCajaDelDia(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile?.role]);

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

  /** Cuotas/préstamos con pago registrado hoy (semáforo verde) */
  const totalCobrados = clientes.filter((c) => c.cuotaPagadaHoy).length;

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
    { prioridad: 1 as PrioridadClienteRuta, titulo: "URGENTE · EN MORA" },
    {
      prioridad: 2 as PrioridadClienteRuta,
      titulo: "ADVERTENCIA · SIN PAGO (1–2 veces)",
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
    FILTROS_OPCIONES.find((f) => f.id === filtro)?.label ?? "Todos";
  const filtroLabel =
    FILTROS_OPCIONES.find((f) => f.id === filtro)?.label?.toLowerCase() ??
    "este filtro";
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
              Tu caja del día
            </h3>
            {cajaDelDiaResumen?.fechaDia ? (
              <p className="ruta-dia-caja-desc">{cajaDelDiaResumen.fechaDia}</p>
            ) : null}
          </div>
          <div className="ruta-dia-caja-monto-wrap">
            <span className="ruta-dia-caja-monto" aria-live="polite">
              {loadingCajaDelDia
                ? "…"
                : cajaDelDiaResumen
                  ? formatCurrency(tuCajaDelDiaDesdeTotales(cajaDelDiaResumen))
                  : "—"}
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
              {FILTROS_OPCIONES.map((f) => (
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
                        `${grupo.cantidadPrestamos} préstamos`
                      );
                    }
                    if (grupo.diasMoraMax > 0) {
                      subtituloParts.push(
                        `${grupo.diasMoraMax} días de mora`
                      );
                    }
                    const allCuotaPagada =
                      grupo.items.length > 0 &&
                      grupo.items.every((i) => i.cuotaPagadaHoy);
                    const estadoFirst = allCuotaPagada
                      ? "pagada"
                      : grupo.items.some((i) => i.estado === "mora")
                        ? "mora"
                        : tieneAlertaNoPago(grupo)
                          ? "alerta"
                          : (grupo.items[0]?.estado?.toLowerCase() ?? "activo");

                    return (
                      <li
                        key={grupo.clienteId}
                        className={`ruta-dia-item ruta-dia-item-semaforo-${semaforo} ${grupo.visitado ? "ruta-dia-item-visitado" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleClickCliente(grupo)}
                        onKeyDown={(e) => handleKeyDown(e, grupo)}
                        aria-label={`${grupo.clienteNombre}, ${getSemaforoLabel(semaforo)}. Saldo a cobrar ahora ${formatCurrency(grupo.items[0]?.monto ?? 0)}${grupo.cantidadPrestamos > 1 ? `; total ${grupo.cantidadPrestamos} préstamos ${formatCurrency(grupo.totalMonto)}` : ""}. ${grupo.visitado ? "Visitado" : ""}`}
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
          <span className="ruta-dia-footer-value ruta-dia-footer-value-green">{totalCobrados}</span>
        </div>
        <div className="ruta-dia-footer-item">
          <span className="ruta-dia-footer-label">Pendientes</span>
          <span className="ruta-dia-footer-value">
            {clientes.length - totalCobrados}
          </span>
        </div>
      </footer>
    </div>
  );
}
