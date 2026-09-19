"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { FILTROS_RUTA_DIA } from "@/hooks/useRutaDia";
import { useAdminRegistrarPagos } from "@/hooks/useAdminRegistrarPagos";
import { RutaDiaClientesLista } from "@/components/ruta-dia/RutaDiaClientesLista";
import { RutaDiaConteosResumen } from "@/components/ruta-dia/RutaDiaConteosResumen";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import type { ClienteRutaGrupo } from "@/types/finanzas";

export default function RegistrarPagosAdminPageContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const { rutas } = useAdminDashboard();
  const [filtroExpandido, setFiltroExpandido] = useState(false);

  const {
    clientes,
    clientesFiltrados,
    clientesFiltradosGrouped,
    filtro,
    setFiltro,
    busquedaNombre,
    setBusquedaNombre,
    filtroRutaId,
    setFiltroRutaId,
    loading,
    error,
    refetch,
    markVisitado,
    conteos,
  } = useAdminRegistrarPagos();

  const rutaSeleccionada = useMemo(
    () => rutas.find((r) => r.id === filtroRutaId),
    [rutas, filtroRutaId]
  );

  const handleClickCliente = useCallback(
    (grupo: ClienteRutaGrupo) => {
      markVisitado(grupo.clienteId);
      const principal = grupo.items[0];
      if (!principal) return;
      router.push(
        `/dashboard/admin/cobrar?clienteId=${encodeURIComponent(principal.clienteId)}&prestamoId=${encodeURIComponent(principal.prestamoId)}&from=registrar-pagos`
      );
    },
    [markVisitado, router]
  );

  if (!profile || !isAdminPanelRole(profile.role)) return null;

  const hoy = new Date();
  const fechaLabel = hoy.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const filtroActualLabel =
    FILTROS_RUTA_DIA.find((f) => f.id === filtro)?.label ?? "Todos";
  const filtroLabel =
    FILTROS_RUTA_DIA.find((f) => f.id === filtro)?.label?.toLowerCase() ?? "este filtro";
  const emptySinClientes = clientes.length === 0;
  const emptyFiltro = !emptySinClientes && clientesFiltrados.length === 0;
  const busquedaTrim = busquedaNombre.trim();

  const subtituloRuta = filtroRutaId
    ? rutaSeleccionada?.nombre?.trim() || "Ruta seleccionada"
    : "Todas las rutas";

  return (
    <div className="card ruta-dia-card registrar-pagos-admin-card">
      <header className="ruta-dia-header">
        <div>
          <h2 className="ruta-dia-title">Cobro diario</h2>
          <p className="ruta-dia-subtitle">
            {fechaLabel} · {subtituloRuta}
          </p>
        </div>
      </header>

      <RutaDiaConteosResumen conteos={conteos} />

      {error && (
        <div className="ruta-dia-error-wrap" role="alert">
          <p className="ruta-dia-error">{error}</p>
          <button type="button" className="ruta-dia-refresh-btn" onClick={refetch}>
            Reintentar
          </button>
        </div>
      )}

      <div className="registrar-pagos-admin-filtros">
        <div className="pagos-diarios-filtros-fila pagos-diarios-filtros-fila--secundaria admin-clientes-filtros-row registrar-pagos-admin-filtros-fila">
          <div className="admin-clientes-filtro-ruta pagos-diarios-filtro-ruta">
            <label htmlFor="registrar-pagos-filtro-ruta" className="admin-clientes-filtro-ruta-label">
              Ruta
            </label>
            <select
              id="registrar-pagos-filtro-ruta"
              className="admin-clientes-filtro-ruta-select"
              value={filtroRutaId}
              onChange={(e) => setFiltroRutaId(e.target.value)}
              aria-label="Filtrar clientes por ruta"
            >
              <option value="">Todas las rutas</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                  {r.ubicacion ? ` · ${r.ubicacion}` : ""}
                </option>
              ))}
            </select>
          </div>

          <label htmlFor="registrar-pagos-buscador" className="pagos-diarios-filtro-cliente registrar-pagos-admin-buscador">
            <span className="admin-clientes-filtro-ruta-label">Cliente</span>
            <div className="prestamo-admin-search-field pagos-diarios-search-field ruta-dia-search-field registrar-pagos-admin-search-field">
              <span className="prestamo-admin-search-icon ruta-dia-search-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                id="registrar-pagos-buscador"
                className="prestamo-admin-search-input pagos-diarios-search-input ruta-dia-search-input"
                type="search"
                value={busquedaNombre}
                onChange={(e) => setBusquedaNombre(e.target.value)}
                placeholder="Buscar por nombre..."
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
          </label>
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
              <span className="ruta-dia-filtro-trigger-icon" aria-hidden>
                {" "}
                &gt;
              </span>
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

      <RutaDiaClientesLista
        clientesFiltradosGrouped={clientesFiltradosGrouped}
        loading={loading}
        emptySinClientes={emptySinClientes}
        emptyFiltro={emptyFiltro}
        busquedaTrim={busquedaTrim}
        filtroLabel={filtroLabel}
        emptySinClientesMsg="No hay préstamos activos para cobrar."
        onSelectGrupo={handleClickCliente}
      />
    </div>
  );
}
