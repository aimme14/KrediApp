"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { listClientes, setClienteMoroso, type ClienteItem } from "@/lib/empresa-api";

export default function ClienteMorosoPage() {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  const morosos = clientes.filter((c) => c.moroso);
  const noMorosos = clientes.filter((c) => !c.moroso);

  if (!profile || profile.role !== "admin") return null;

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
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h3 style={{ marginTop: 0 }}>Clientes marcados como morosos</h3>
            {morosos.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>Ningún cliente marcado como moroso.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Ubicación</th>
                      <th>Teléfono</th>
                      <th>Cédula</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {morosos.map((c) => (
                      <tr key={c.id}>
                        <td>{c.nombre}</td>
                        <td>{c.ubicacion || "—"}</td>
                        <td>{c.telefono || "—"}</td>
                        <td>{c.cedula || "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-success"
                            onClick={() => handleToggleMoroso(c)}
                            disabled={togglingId === c.id}
                          >
                            {togglingId === c.id ? "..." : "Quitar de morosos"}
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
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Ubicación</th>
                      <th>Teléfono</th>
                      <th>Cédula</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noMorosos.map((c) => (
                      <tr key={c.id}>
                        <td>{c.nombre}</td>
                        <td>{c.ubicacion || "—"}</td>
                        <td>{c.telefono || "—"}</td>
                        <td>{c.cedula || "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleToggleMoroso(c)}
                            disabled={togglingId === c.id}
                          >
                            {togglingId === c.id ? "..." : "Marcar como moroso"}
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
