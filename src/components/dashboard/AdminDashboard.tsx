"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, createUser } from "@/lib/users";
import type { UserProfile } from "@/types/roles";

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [trabajadores, setTrabajadores] = useState<UserProfile[]>([]);
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
    listUsersByCreator(profile.uid, "trabajador")
      .then((list) => {
        if (!cancelled) setTrabajadores(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  const handleCreateTrabajador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setCreating(true);
    try {
      await createUser({
        email,
        password,
        displayName: displayName || undefined,
        role: "trabajador",
        createdByUid: profile.uid,
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setShowForm(false);
      const list = await listUsersByCreator(profile.uid, "trabajador");
      setTrabajadores(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear trabajador");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="card"><p>Cargando trabajadores...</p></div>;

  return (
    <>
      <div className="card flex justify-between items-center">
        <h2 style={{ margin: 0 }}>Panel Administrador</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancelar" : "Crear trabajador"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nuevo trabajador</h3>
          <form onSubmit={handleCreateTrabajador}>
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
              {creating ? "Creando..." : "Crear trabajador"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Trabajadores creados por mí</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Nombre</th>
              </tr>
            </thead>
            <tbody>
              {trabajadores.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ color: "#a1a1aa" }}>
                    No hay trabajadores. Crea uno con el botón &quot;Crear trabajador&quot;.
                  </td>
                </tr>
              ) : (
                trabajadores.map((t) => (
                  <tr key={t.uid}>
                    <td>{t.email}</td>
                    <td>{t.displayName ?? "—"}</td>
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
