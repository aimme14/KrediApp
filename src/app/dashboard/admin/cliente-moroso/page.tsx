"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  formatClienteCodigoRutaYNumero,
  listClientes,
  setClienteMoroso,
  type ClienteItem,
} from "@/lib/empresa-api";
import { guardOfflineWrite, useOnline } from "@/hooks/useOnline";
import { isAdminPanelRole } from "@/lib/admin-panel-role";

function codigoSinCL(codigo: string | undefined): string {
  return formatClienteCodigoRutaYNumero(codigo).replace(/^CL-/i, "");
}

export default function ClienteMorosoPage() {
  const { user, profile } = useAuth();
  const online = useOnline();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filtroNombre, setFiltroNombre] = useState("");

  const loadClientes = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    listClientes(token)
      .then(setClientes)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar clientes"))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  const handleToggleMoroso = async (c: ClienteItem) => {
    if (!guardOfflineWrite(online, setError)) return;
    if (!user) return;
    setError(null);
    setTogglingId(c.id);
    try {
      const token = await user.getIdToken();
      await setClienteMoroso(token, c.id, !c.moroso);
      setClientes((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, moroso: !x.moroso } : x))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setTogglingId(null);
    }
  };

  const filtroNombreLower = filtroNombre.trim().toLowerCase();

  const coincideConFiltro = useCallback(
    (c: ClienteItem) => {
      if (!filtroNombreLower) return true;
      const nombre = (c.nombre ?? "").toLowerCase();
      const codigo = c.codigo ? formatClienteCodigoRutaYNumero(c.codigo).toLowerCase() : "";
      const codigoCorto = codigoSinCL(c.codigo).toLowerCase();
      const cedula = (c.cedula ?? "").toLowerCase();
      return (
        nombre.includes(filtroNombreLower) ||
        codigo.includes(filtroNombreLower) ||
        codigoCorto.includes(filtroNombreLower) ||
        cedula.includes(filtroNombreLower)
      );
    },
    [filtroNombreLower]
  );

  const morosos = useMemo(() => clientes.filter((c) => c.moroso), [clientes]);
  const noMorosos = useMemo(() => clientes.filter((c) => !c.moroso), [clientes]);
  const morososFiltrados = useMemo(
    () => morosos.filter(coincideConFiltro),
    [morosos, coincideConFiltro]
  );
  const noMorososFiltrados = useMemo(
    () => noMorosos.filter(coincideConFiltro),
    [noMorosos, coincideConFiltro]
  );
  const totalFiltrados = morososFiltrados.length + noMorososFiltrados.length;

  if (!profile || !isAdminPanelRole(profile.role)) return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Cliente moroso</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Aquí se excluye al cliente de la ruta normal como caso especial. No se le podrá volver a prestar hasta que lo quites de morosos.
      </p>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <>
          {clientes.length > 0 && (
            <div className="prestamo-admin-search-toolbar" style={{ marginBottom: "1.25rem" }}>
              <div className="prestamo-admin-search-field">
                <span className="prestamo-admin-search-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <input
                  id="clientes-morosos-buscador"
                  className="prestamo-admin-search-input"
                  type="search"
                  value={filtroNombre}
                  onChange={(e) => setFiltroNombre(e.target.value)}
                  placeholder="Buscar por nombre, código o cédula..."
                  aria-label="Buscar clientes morosos por nombre, código o cédula"
                />
              </div>
              {filtroNombreLower ? (
                <p className="prestamo-admin-search-hint">
                  {totalFiltrados} cliente{totalFiltrados !== 1 ? "s" : ""} encontrado{totalFiltrados !== 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
          )}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>Clientes marcados como morosos</h3>
            {morosos.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>Ningún cliente marcado como moroso.</p>
            ) : morososFiltrados.length === 0 ? (
              <p className="prestamo-admin-filtro-vacio">
                No hay clientes morosos que coincidan con «{filtroNombre.trim()}».
              </p>
            ) : (
              <div className="table-wrap cliente-moroso-table-wrap">
                <table className="cliente-moroso-clientes-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Teléfono</th>
                      <th>Nombre</th>
                      <th>Ubicación</th>
                      <th>Cédula</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {morososFiltrados.map((c) => (
                      <tr key={c.id}>
                        <td title={c.codigo}>{codigoSinCL(c.codigo)}</td>
                        <td>{c.telefono || "—"}</td>
                        <td>{c.nombre}</td>
                        <td>{c.ubicacion || "—"}</td>
                        <td>{c.cedula || "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-success"
                            onClick={() => handleToggleMoroso(c)}
                            disabled={togglingId === c.id || !online}
                          >
                            {togglingId === c.id ? (
                              "..."
                            ) : (
                              <>
                                <span className="cliente-moroso-btn-full">Quitar de morosos</span>
                                <span className="cliente-moroso-btn-mob">Quitar</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Resto de clientes (marcar como moroso)</h3>
            {noMorosos.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No hay más clientes o todos están marcados como morosos.</p>
            ) : noMorososFiltrados.length === 0 ? (
              <p className="prestamo-admin-filtro-vacio">
                No hay clientes que coincidan con «{filtroNombre.trim()}».
              </p>
            ) : (
              <div className="table-wrap cliente-moroso-table-wrap">
                <table className="cliente-moroso-clientes-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Teléfono</th>
                      <th>Nombre</th>
                      <th>Ubicación</th>
                      <th>Cédula</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noMorososFiltrados.map((c) => (
                      <tr key={c.id}>
                        <td title={c.codigo}>{codigoSinCL(c.codigo)}</td>
                        <td>{c.telefono || "—"}</td>
                        <td>{c.nombre}</td>
                        <td>{c.ubicacion || "—"}</td>
                        <td>{c.cedula || "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleToggleMoroso(c)}
                            disabled={togglingId === c.id || !online}
                          >
                            {togglingId === c.id ? (
                              "..."
                            ) : (
                              <>
                                <span className="cliente-moroso-btn-full">Marcar como moroso</span>
                                <span className="cliente-moroso-btn-mob">Pasar a morosos</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
