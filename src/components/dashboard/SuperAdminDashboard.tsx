"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listAllJefes, setJefeEnabled, createUser } from "@/lib/users";
import type { UserProfile } from "@/types/roles";
import { roleLabel } from "@/types/roles";

export default function SuperAdminDashboard() {
  const { profile } = useAuth();
  const [jefes, setJefes] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== "superAdmin") return;
    let cancelled = false;
    listAllJefes()
      .then((list) => {
        if (!cancelled) setJefes(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  const handleToggle = async (jefe: UserProfile) => {
    if (!profile) return;
    setError(null);
    try {
      await setJefeEnabled(jefe.uid, !jefe.enabled, profile.uid);
      setJefes((prev) =>
        prev.map((u) => (u.uid === jefe.uid ? { ...u, enabled: !u.enabled } : u))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    }
  };

  const handleCreateJefe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setCreating(true);
    try {
      await createUser({
        email,
        password,
        displayName: displayName || undefined,
        role: "jefe",
        createdByUid: profile.uid,
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setShowForm(false);
      const list = await listAllJefes();
      setJefes(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear jefe");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="card"><p>Cargando jefes...</p></div>;

  return (
    <>
      <div className="card">
        <div className="card-header-row">
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : "Crear jefe"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nuevo jefe</h3>
          <form onSubmit={handleCreateJefe}>
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
              {creating ? "Creando..." : "Crear jefe"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Jefes</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Correo</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {jefes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                    No hay jefes. Crea uno con el botón &quot;Crear jefe&quot;.
                  </td>
                </tr>
              ) : (
                jefes.map((j) => (
                  <tr key={j.uid}>
                    <td>
                      <code className="user-code" title="JF = Jefe, número secuencial">
                        {j.codigo ?? "—"}
                      </code>
                    </td>
                    <td>{j.email}</td>
                    <td>{j.displayName ?? "—"}</td>
                    <td>
                      <span className={j.enabled ? "badge badge-enabled" : "badge badge-disabled"}>
                        {j.enabled ? "Habilitado" : "Deshabilitado"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn ${j.enabled ? "btn-danger" : "btn-success"}`}
                        onClick={() => handleToggle(j)}
                      >
                        {j.enabled ? "Deshabilitar" : "Habilitar"}
                      </button>
                    </td>
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
