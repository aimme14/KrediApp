"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { createCliente, formatClienteCodigoRutaYNumero } from "@/lib/empresa-api";

export default function ClientePage() {
  const { user, profile } = useAuth();
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
  const PAGE_SIZE = 15;
  const [pagina, setPagina] = useState(1);
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroPrestamoActivo, setFiltroPrestamoActivo] = useState<"todos" | "si" | "no">("todos");
  const [filtroRutaId, setFiltroRutaId] = useState("");

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

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      if (filtroNombreLower) {
        const nombre = (c.nombre ?? "").toLowerCase();
        const codigo = c.codigo ? formatClienteCodigoRutaYNumero(c.codigo).toLowerCase() : "";
        const cedula = (c.cedula ?? "").toLowerCase();
        const coincideNombre =
          nombre.includes(filtroNombreLower) ||
          codigo.includes(filtroNombreLower) ||
          cedula.includes(filtroNombreLower);
        if (!coincideNombre) return false;
      }
      if (filtroPrestamoActivo === "si" && !c.prestamo_activo) return false;
      if (filtroPrestamoActivo === "no" && c.prestamo_activo) return false;
      if (filtroRutaId && (c.rutaId ?? "") !== filtroRutaId) return false;
      return true;
    });
  }, [clientes, filtroNombreLower, filtroPrestamoActivo, filtroRutaId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creando..." : "Crear cliente"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card admin-clientes-list-card">
        <h3 style={{ marginTop: 0 }}>Clientes</h3>
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
    </div>
  );
}
