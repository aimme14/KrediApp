"use client";

import { useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import { useRuta } from "@/hooks/useRuta";
import { FILTROS_RUTA_DIA, useRutaDia } from "@/hooks/useRutaDia";
import { RutaDiaClientesLista } from "@/components/ruta-dia/RutaDiaClientesLista";
import { RutaDiaConteosResumen } from "@/components/ruta-dia/RutaDiaConteosResumen";
import type { ClienteRutaGrupo } from "@/types/finanzas";

function formatCurrency(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

export default function TrabajadorRutaPageContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const { loading: loadingCajaDelDia, tuCajaActual } = useTrabajadorCajaDia();
  const cajaActual = tuCajaActual ?? 0;
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
    }),
    [clientes]
  );

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

      <RutaDiaConteosResumen conteos={conteosRuta} />

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
              Tu caja actual
            </h3>
            <p className="ruta-dia-caja-desc">Efectivo acumulado hasta entregar el reporte</p>
          </div>
          <div className="ruta-dia-caja-monto-wrap">
            <span className="ruta-dia-caja-monto" aria-live="polite">
              {loadingCajaDelDia && tuCajaActual == null
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
                  className={`ruta-dia-chip${f.id === "pasa_mas_tarde" ? " ruta-dia-chip-pasa-mas-tarde" : ""}${filtro === f.id ? " ruta-dia-chip-active" : ""}${filtro === f.id && f.id === "pasa_mas_tarde" ? " ruta-dia-chip-pasa-mas-tarde-active" : ""}`}
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

      <RutaDiaClientesLista
        clientesFiltradosGrouped={clientesFiltradosGrouped}
        loading={loading}
        emptySinClientes={emptySinClientes}
        emptyFiltro={emptyFiltro}
        busquedaTrim={busquedaTrim}
        filtroLabel={filtroLabel}
        emptySinClientesMsg="No tienes clientes en tu ruta."
        onSelectGrupo={handleClickCliente}
      />
    </div>
  );
}
