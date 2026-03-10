"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { listClientes, createCliente, listRutas, formatClienteCodigoCorto, type ClienteItem, type RutaItem } from "@/lib/empresa-api";

export default function ClientePage() {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [rutas, setRutas] = useState<RutaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      listRutas(token).then(setRutas).catch(() => {});
    });
  }, [user]);

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
      await loadClientes();
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
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Crea clientes con nombre, ubicación, dirección, teléfono, cédula y ruta a la que pertenecen.
      </p>

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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Clientes</h3>
        {loading ? (
          <p>Cargando...</p>
        ) : clientes.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay clientes. Crea uno con el botón &quot;Nuevo cliente&quot;.</p>
        ) : (
          <div className="table-wrap">
            <table>
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
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td title={c.codigo ?? undefined}>
                      {formatClienteCodigoCorto(c.codigo)}
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
        )}
      </div>
    </div>
  );
}
