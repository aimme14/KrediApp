"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, createUser } from "@/lib/users";
import type { UserProfile } from "@/types/roles";

export default function JefeDashboard() {
  const { profile } = useAuth();
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    listUsersByCreator(profile.uid, "admin")
      .then((list) => {
        if (!cancelled) setAdmins(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setCreating(true);
    try {
      await createUser({
        email,
        password,
        displayName: displayName || undefined,
        role: "admin",
        createdByUid: profile.uid,
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setShowForm(false);
      const list = await listUsersByCreator(profile.uid, "admin");
      setAdmins(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear administrador");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="card"><p>Cargando administradores...</p></div>;

  return (
    <>
      <div className="card">
        <div className="card-header-row">
          <h2>Panel Jefe</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : "Crear administrador"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nuevo administrador</h3>
          <form onSubmit={handleCreateAdmin}>
            <div className="form-group">
              <label>Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label>Nombre (opcional)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creando..." : "Crear administrador"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Administradores creados por mí</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Nombre</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ color: "var(--text-muted)" }}>
                    No hay administradores. Crea uno con el botón &quot;Crear administrador&quot;.
                  </td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a.uid}>
                    <td>{a.email}</td>
                    <td>{a.displayName ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
