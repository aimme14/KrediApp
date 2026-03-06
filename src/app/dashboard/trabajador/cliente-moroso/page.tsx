"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listClientes, type ClienteItem } from "@/lib/empresa-api";

export default function ClienteMorosoTrabajadorPage() {
  const { user, profile } = useAuth();
  const [morosos, setMorosos] = useState<ClienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      listClientes(token, undefined, { moroso: true })
        .then(setMorosos)
        .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
        .finally(() => setLoading(false));
    });
  }, [user]);

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Cliente moroso</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Clientes asignados por el administrador como morosos, para cobrarles de manera diferente.
      </p>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : morosos.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No tienes clientes morosos asignados en tu ruta.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ubicación</th>
                <th>Dirección</th>
                <th>Teléfono</th>
                <th>Cédula</th>
              </tr>
            </thead>
            <tbody>
              {morosos.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.ubicacion || "—"}</td>
                  <td>{c.direccion || "—"}</td>
                  <td>{c.telefono || "—"}</td>
                  <td>{c.cedula || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
