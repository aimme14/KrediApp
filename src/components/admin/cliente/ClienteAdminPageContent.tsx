"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import {
  createCliente,
  updateCliente,
  formatClienteCodigoRutaYNumero,
  type ClienteItem,
} from "@/lib/empresa-api";
import { filtrarClientesParaExport } from "@/lib/export-clientes";
import { getEmpresa } from "@/lib/empresa";
import { ExportClientesModal } from "@/components/ExportClientesModal";
import { guardOfflineWrite, OFFLINE_MSG, useOnline } from "@/hooks/useOnline";

export default function ClienteAdminPageContent() {
  const { user, profile } = useAuth();
  const online = useOnline();
  const { rutas } = useAdminDashboard();
  const { clientes, refresh: refreshLista } = useTrabajadorLista();
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [creating, setCreating] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<ClienteItem | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editUbicacion, setEditUbicacion] = useState("");
  const [editDireccion, setEditDireccion] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editCedula, setEditCedula] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const PAGE_SIZE = 15;
  const [pagina, setPagina] = useState(1);
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroPrestamoActivo, setFiltroPrestamoActivo] = useState<"todos" | "si" | "no">("todos");
  const [filtroRutaId, setFiltroRutaId] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [nombreEmpresa, setNombreEmpresa] = useState("KrediApp");

  const rutaPorId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rutas) m[r.id] = r.nombre;
    return m;
  }, [rutas]);

  const filtroNombreLower = filtroNombre.trim().toLowerCase();
  const hayFiltrosActivos =
    Boolean(filtroNombreLower) ||
    filtroPrestamoActivo !== "todos" ||
    Boolean(filtroRutaId);

  const contadoresPorFiltro = useMemo(() => {
    const porRuta = filtroRutaId
      ? clientes.filter((c) => (c.rutaId ?? "") === filtroRutaId)
      : clientes;

    return {
      todos: porRuta.length,
      si: porRuta.filter((c) => c.prestamo_activo).length,
      no: porRuta.filter((c) => !c.prestamo_activo).length,
    };
  }, [clientes, filtroRutaId]);

  const FILTROS_CLIENTE = [
    { value: "todos" as const, label: "Todos" },
    { value: "si" as const, label: "Con préstamo" },
    { value: "no" as const, label: "Sin préstamo" },
  ];

  const clientesFiltrados = useMemo(
    () =>
      filtrarClientesParaExport(
        clientes,
        filtroNombre,
        filtroRutaId,
        filtroPrestamoActivo
      ),
    [clientes, filtroNombre, filtroRutaId, filtroPrestamoActivo]
  );

  const clientesExportables = useMemo(
    () => filtrarClientesParaExport(clientes, filtroNombre, filtroRutaId, "todos"),
    [clientes, filtroNombre, filtroRutaId]
  );

  const clientesPaginados = useMemo(() => {
    const sorted = [...clientesFiltrados].sort(
      (a, b) => (b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0) -
                (a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0)
    );
    return sorted.slice(0, pagina * PAGE_SIZE);
  }, [clientesFiltrados, pagina]);

  const hayMas = clientesPaginados.length < clientesFiltrados.length;

  useEffect(() => {
    setPagina(1);
  }, [filtroNombre, filtroPrestamoActivo, filtroRutaId]);

  useEffect(() => {
    if (!profile?.empresaId) return;
    getEmpresa(profile.empresaId)
      .then((e) => {
        if (e?.nombre) setNombreEmpresa(e.nombre.trim());
      })
      .catch(() => {});
  }, [profile?.empresaId]);

  const cerrarEdicion = useCallback(() => {
    setClienteEditando(null);
    setEditError(null);
    setSavingEdit(false);
  }, []);

  const abrirEdicion = useCallback((c: ClienteItem) => {
    setClienteEditando(c);
    setEditNombre(c.nombre ?? "");
    setEditUbicacion(c.ubicacion ?? "");
    setEditDireccion(c.direccion ?? "");
    setEditTelefono(c.telefono ?? "");
    setEditCedula(c.cedula ?? "");
    setEditError(null);
  }, []);

  useEffect(() => {
    if (!clienteEditando) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !savingEdit) cerrarEdicion();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clienteEditando, savingEdit, cerrarEdicion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardOfflineWrite(online, setError)) return;
    if (!user) return;
    if (!rutaId.trim()) {
      setError("Debes seleccionar una ruta");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const token = await user.getIdToken();
      await createCliente(token, {
        nombre: nombre.trim(),
        ubicacion: ubicacion.trim() || undefined,
        direccion: direccion.trim() || undefined,
        telefono: telefono.trim() || undefined,
        cedula: cedula.trim() || undefined,
        rutaId: rutaId.trim(),
      });
      setNombre("");
      setUbicacion("");
      setDireccion("");
      setTelefono("");
      setCedula("");
      setRutaId("");
      setShowForm(false);
      await refreshLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear cliente");
    } finally {
      setCreating(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardOfflineWrite(online, setEditError)) return;
    if (!user || !clienteEditando) return;
    if (!editNombre.trim()) {
      setEditError("El nombre es obligatorio");
      return;
    }
    setEditError(null);
    setSavingEdit(true);
    try {
      const token = await user.getIdToken();
      await updateCliente(token, clienteEditando.id, {
        nombre: editNombre.trim(),
        ubicacion: editUbicacion.trim(),
        direccion: editDireccion.trim(),
        telefono: editTelefono.trim(),
        cedula: editCedula.trim(),
      });
      cerrarEdicion();
      await refreshLista();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Error al actualizar cliente");
    } finally {
      setSavingEdit(false);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Cliente</h2>


      <div style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancelar" : "Nuevo cliente"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Nuevo cliente</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="Nombre completo"
              />
            </div>
            <div className="form-group">
              <label>Ubicación</label>
              <input
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ciudad o zona"
              />
            </div>
            <div className="form-group">
              <label>Dirección</label>
              <input
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Dirección física"
              />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Número de contacto"
              />
            </div>
            <div className="form-group">
              <label>Cédula</label>
              <input
                type="text"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Número de cédula"
              />
            </div>
            <div className="form-group">
              <label>Ruta a la que pertenece</label>
              <select
                value={rutaId}
                onChange={(e) => setRutaId(e.target.value)}
                required
                style={{ width: "100%", padding: "0.5rem" }}
              >
                <option value="">Seleccionar ruta</option>
                {rutas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre} {r.ubicacion ? `· ${r.ubicacion}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="error-msg">{error}</p>}
            {!online && !error && <p className="error-msg" role="alert">{OFFLINE_MSG}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating || !online}>
              {creating ? "Creando..." : "Crear cliente"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card admin-clientes-list-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Clientes</h3>
          {clientesExportables.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.8125rem" }}
              onClick={() => setShowExportModal(true)}
              title="Exportar clientes a Excel"
            >
              ↓ Excel
            </button>
          )}
        </div>
        {loading ? (
          <p>Cargando...</p>
        ) : clientes.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay clientes. Crea uno con el botón &quot;Nuevo cliente&quot;.</p>
        ) : (
          <>
            <div className="prestamo-admin-filtros-wrap admin-clientes-filtros-wrap">
              <div className="prestamo-admin-search-toolbar">
                <div className="prestamo-admin-search-field">
                  <span className="prestamo-admin-search-icon" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </span>
                  <input
                    id="clientes-buscador"
                    className="prestamo-admin-search-input"
                    type="search"
                    value={filtroNombre}
                    onChange={(e) => setFiltroNombre(e.target.value)}
                    placeholder="Buscar por nombre, código o cédula..."
                    aria-label="Buscar clientes por nombre, código o cédula"
                  />
                </div>
                {hayFiltrosActivos ? (
                  <p className="prestamo-admin-search-hint">
                    {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""} encontrado{clientesFiltrados.length !== 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>
              <div className="admin-clientes-filtros-row">
                <div
                  className="prestamo-admin-tabs admin-clientes-filtro-tabs"
                  role="tablist"
                  aria-label="Filtrar por préstamo activo"
                >
                  {FILTROS_CLIENTE.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={filtroPrestamoActivo === value}
                      className={`prestamo-admin-tab${filtroPrestamoActivo === value ? " prestamo-admin-tab--active" : ""}`}
                      onClick={() => setFiltroPrestamoActivo(value)}
                      aria-label={`${label}, ${contadoresPorFiltro[value]} cliente${contadoresPorFiltro[value] !== 1 ? "s" : ""}`}
                    >
                      {label}
                      <span className="prestamo-admin-tab-count">({contadoresPorFiltro[value]})</span>
                    </button>
                  ))}
                </div>
                <div className="admin-clientes-filtro-ruta">
                  <label htmlFor="clientes-filtro-ruta" className="admin-clientes-filtro-ruta-label">
                    Ruta
                  </label>
                  <select
                    id="clientes-filtro-ruta"
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
              </div>
            </div>
            {clientesFiltrados.length === 0 ? (
              <p className="prestamo-admin-filtro-vacio">
                {filtroNombreLower
                  ? `No hay clientes que coincidan con «${filtroNombre.trim()}».`
                  : "No hay clientes que coincidan con los filtros seleccionados."}
              </p>
            ) : (
            <>
            <div className="table-wrap admin-clientes-table-wrap">
              <table className="admin-clientes-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Ubicación</th>
                  <th>Teléfono</th>
                  <th>Cédula</th>
                  <th>Préstamo activo</th>
                  <th>Moroso</th>
                  <th className="admin-clientes-th-accion">Acción</th>
                </tr>
              </thead>
              <tbody>
                {clientesPaginados.map((c) => (
                  <tr key={c.id}>
                    <td title={c.codigo ?? undefined}>
                      {formatClienteCodigoRutaYNumero(c.codigo)}
                    </td>
                    <td>{c.nombre}</td>
                    <td>{c.ubicacion || "—"}</td>
                    <td>{c.telefono || "—"}</td>
                    <td>{c.cedula || "—"}</td>
                    <td>{c.prestamo_activo ? "Sí" : "No"}</td>
                    <td>{c.moroso ? "Sí (excluido)" : "No"}</td>
                    <td className="admin-clientes-td-accion">
                      <button
                        type="button"
                        className="admin-clientes-edit-btn"
                        onClick={() => abrirEdicion(c)}
                        aria-label={`Actualizar datos de ${c.nombre}`}
                        title="Actualizar datos"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hayMas && (
            <div className="admin-clientes-ver-mas">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPagina((p) => p + 1)}
              >
                Ver más clientes
              </button>
            </div>
          )}
            </>
            )}
          </>
        )}
      </div>

      {clienteEditando && (
        <div
          className="gf-modal-backdrop"
          onClick={() => !savingEdit && cerrarEdicion()}
          role="presentation"
        >
          <div
            className="gf-modal gf-modal--cliente-edit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cliente-edit-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cliente-edit-modal-title" className="gf-modal-title">
              Actualizar datos
            </h2>
            <dl className="admin-clientes-edit-readonly">
              <div className="admin-clientes-edit-readonly-row">
                <dt className="admin-clientes-edit-readonly-label">Código</dt>
                <dd className="admin-clientes-edit-readonly-value">
                  {formatClienteCodigoRutaYNumero(clienteEditando.codigo)}
                </dd>
              </div>
              <div className="admin-clientes-edit-readonly-row">
                <dt className="admin-clientes-edit-readonly-label">Ruta</dt>
                <dd className="admin-clientes-edit-readonly-value">
                  {rutaPorId[clienteEditando.rutaId] ?? "—"}
                </dd>
              </div>
              <div className="admin-clientes-edit-readonly-row">
                <dt className="admin-clientes-edit-readonly-label">Préstamo activo</dt>
                <dd className="admin-clientes-edit-readonly-value">
                  {clienteEditando.prestamo_activo ? "Sí" : "No"}
                </dd>
              </div>
            </dl>

            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label htmlFor="cliente-edit-nombre">Nombre</label>
                <input
                  id="cliente-edit-nombre"
                  type="text"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  required
                  placeholder="Nombre completo"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="cliente-edit-ubicacion">Ubicación</label>
                <input
                  id="cliente-edit-ubicacion"
                  type="text"
                  value={editUbicacion}
                  onChange={(e) => setEditUbicacion(e.target.value)}
                  placeholder="Ciudad o zona"
                />
              </div>
              <div className="form-group">
                <label htmlFor="cliente-edit-direccion">Dirección</label>
                <input
                  id="cliente-edit-direccion"
                  type="text"
                  value={editDireccion}
                  onChange={(e) => setEditDireccion(e.target.value)}
                  placeholder="Dirección física"
                />
              </div>
              <div className="form-group">
                <label htmlFor="cliente-edit-telefono">Teléfono</label>
                <input
                  id="cliente-edit-telefono"
                  type="tel"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                  placeholder="Número de contacto"
                />
              </div>
              <div className="form-group">
                <label htmlFor="cliente-edit-cedula">Cédula</label>
                <input
                  id="cliente-edit-cedula"
                  type="text"
                  value={editCedula}
                  onChange={(e) => setEditCedula(e.target.value)}
                  placeholder="Número de cédula"
                />
              </div>
              {editError && <p className="error-msg">{editError}</p>}
              <div className="gf-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={cerrarEdicion}
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEdit || !online}
                  aria-busy={savingEdit}
                >
                  {savingEdit ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExportModal && (
        <ExportClientesModal
          onCerrar={() => setShowExportModal(false)}
          clientes={clientes}
          rutaPorId={rutaPorId}
          filtroRutaId={filtroRutaId}
          filtroNombre={filtroNombre.trim() || undefined}
          nombreEmpresa={nombreEmpresa}
          filtroPrestamoInicial={filtroPrestamoActivo}
        />
      )}
    </div>
  );
}
