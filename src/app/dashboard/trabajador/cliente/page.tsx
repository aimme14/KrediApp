"use client";

import { Fragment, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { createCliente, formatClienteCodigoCorto } from "@/lib/empresa-api";

export default function ClienteTrabajadorPage() {
  const { user, profile } = useAuth();
  const {
    clientes,
    loading,
    error: listaError,
    refresh,
  } = useTrabajadorLista();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [creating, setCreating] = useState(false);
  const [clienteExpandidoId, setClienteExpandidoId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
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
        rutaId: profile?.rutaId ?? "",
      });
      setNombre("");
      setUbicacion("");
      setDireccion("");
      setTelefono("");
      setCedula("");
      setShowForm(false);
      setClienteExpandidoId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear cliente");
    } finally {
      setCreating(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Cliente</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Crea clientes con nombre, ubicación, dirección, teléfono y cédula. Se anexan a tu ruta asignada.
      </p>

      <div style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "Nuevo cliente"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Nuevo cliente</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nombre</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Nombre completo" />
            </div>
            <div className="form-group">
              <label>Ubicación</label>
              <input type="text" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ciudad o zona" />
            </div>
            <div className="form-group">
              <label>Dirección</label>
              <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección física" />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Número de contacto" />
            </div>
            <div className="form-group">
              <label>Cédula</label>
              <input type="text" value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Sin puntos ni espacios" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creando..." : "Crear cliente"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Clientes de tu ruta</h3>
        {(error || listaError) && (
          <p className="error-msg">{error ?? listaError}</p>
        )}
        {loading ? (
          <p>Cargando...</p>
        ) : clientes.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay clientes en tu ruta.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="clientes-col-codigo">Código</th>
                  <th>Nombre</th>
                  <th className="clientes-col-ubicacion">Ubicación</th>
                  <th className="clientes-col-telefono">Teléfono</th>
                  <th className="clientes-col-cedula">Cédula</th>
                  <th className="clientes-col-info-mobile">Información</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => {
                  const estaExpandido = clienteExpandidoId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr>
                        <td className="clientes-col-codigo" title={c.codigo ?? undefined}>
                          {formatClienteCodigoCorto(c.codigo)}
                        </td>
                        <td>{c.nombre}</td>
                        <td className="clientes-col-ubicacion">{c.ubicacion || "—"}</td>
                        <td className="clientes-col-telefono">{c.telefono || "—"}</td>
                        <td className="clientes-col-cedula">{c.cedula || "—"}</td>
                        <td className="clientes-col-info-mobile">
                          <button
                            type="button"
                            className="clientes-info-btn"
                            aria-label={estaExpandido ? `Ocultar información de ${c.nombre}` : `Ver información de ${c.nombre}`}
                            onClick={() => setClienteExpandidoId((prev) => (prev === c.id ? null : c.id))}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                      {estaExpandido && (
                        <tr className="clientes-info-row-mobile">
                          <td colSpan={6}>
                            <div className="clientes-info-card-mobile">
                              <p><strong>Código:</strong> {formatClienteCodigoCorto(c.codigo)}</p>
                              <p><strong>Ubicación:</strong> {c.ubicacion || "—"}</p>
                              <p><strong>Dirección:</strong> {c.direccion || "—"}</p>
                              <p><strong>Teléfono:</strong> {c.telefono || "—"}</p>
                              <p><strong>Cédula:</strong> {c.cedula || "—"}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
