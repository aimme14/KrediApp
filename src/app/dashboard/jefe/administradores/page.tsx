"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, createUser } from "@/lib/users";
import type { UserProfile } from "@/types/roles";

export default function AdministradoresPage() {
  const { profile } = useAuth();
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    cedula: "",
    lugar: "",
    base: "",
    email: "",
    password: "",
  });

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
        email: form.email,
        password: form.password,
        displayName: form.displayName || undefined,
        role: "admin",
        createdByUid: profile.uid,
        cedula: form.cedula || undefined,
        lugar: form.lugar || undefined,
        base: form.base || undefined,
      });
      setForm({ displayName: "", cedula: "", lugar: "", base: "", email: "", password: "" });
      setShowForm(false);
      const list = await listUsersByCreator(profile.uid, "admin");
      setAdmins(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear administrador");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p>Cargando administradores...</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-header-row">
          <h2 style={{ margin: 0 }}>Administradores</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : "Crear administrador"}
          </button>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 0, marginTop: "0.5rem" }}>
          Crea y gestiona los administradores de tu empresa (nombre, cédula, lugar, base, correo, contraseña).
        </p>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nuevo administrador</h3>
          <form onSubmit={handleCreateAdmin}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Nombre completo"
              />
            </div>
            <div className="form-group">
              <label>Cédula</label>
              <input
                type="text"
                value={form.cedula}
                onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))}
                placeholder="Número de cédula"
              />
            </div>
            <div className="form-group">
              <label>Lugar</label>
              <input
                type="text"
                value={form.lugar}
                onChange={(e) => setForm((f) => ({ ...f, lugar: e.target.value }))}
                placeholder="Ciudad o zona"
              />
            </div>
            <div className="form-group">
              <label>Base</label>
              <input
                type="text"
                value={form.base}
                onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))}
                placeholder="Base o sede asignada"
              />
            </div>
            <div className="form-group">
              <label>Correo</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
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
                <th>Código</th>
                <th>Nombre</th>
                <th>Cédula</th>
                <th>Lugar</th>
                <th>Base</th>
                <th>Correo</th>
                <th>Creado por</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ color: "var(--text-muted)" }}>
                    No hay administradores. Crea uno con el botón &quot;Crear administrador&quot;.
                  </td>
                </tr>
              ) : (
                admins.map((a) => (
                  <tr key={a.uid}>
                    <td>
                      <code className="user-code" title="AD = Admin, número secuencial">
                        {a.codigo ?? "—"}
                      </code>
                    </td>
                    <td>{a.displayName ?? "—"}</td>
                    <td>{a.cedula ?? "—"}</td>
                    <td>{a.lugar ?? "—"}</td>
                    <td>{a.base ?? "—"}</td>
                    <td>{a.email}</td>
                    <td title="Código del jefe que creó a este administrador">
                      {a.jefeCodigo ?? "—"}
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
