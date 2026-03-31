"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, createUser } from "@/lib/users";
import type { UserProfile } from "@/types/roles";
import PasswordCreateFields from "@/components/PasswordCreateFields";

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [trabajadores, setTrabajadores] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [base, setBase] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
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
    if (password !== passwordConfirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCreating(true);
    try {
      await createUser({
        email,
        password,
        displayName: displayName.trim() || undefined,
        role: "trabajador",
        createdByUid: profile.uid,
        cedula: cedula.trim() || undefined,
        lugar: ubicacion.trim() || undefined,
        direccion: direccion.trim() || undefined,
        telefono: telefono.trim() || undefined,
        base: base.trim() || undefined,
      });
      setDisplayName("");
      setUbicacion("");
      setDireccion("");
      setTelefono("");
      setCedula("");
      setBase("");
      setEmail("");
      setPassword("");
      setPasswordConfirm("");
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
      <div className="card">
        <div className="card-header-row">
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : "Crear trabajador"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Nuevo trabajador</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
            El correo y la contraseña son las credenciales para que el empleado ingrese al sistema.
          </p>
          <form onSubmit={handleCreateTrabajador}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Nombre completo del empleado"
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
              <label>Base</label>
              <input
                type="text"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="Base asignada"
              />
            </div>
            <div className="form-group">
              <label>Correo (credencial de ingreso)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Correo para iniciar sesión"
              />
            </div>
            <PasswordCreateFields
              password={password}
              passwordConfirm={passwordConfirm}
              onPasswordChange={setPassword}
              onPasswordConfirmChange={setPasswordConfirm}
              disabled={creating}
              passwordId="admin-trab-password"
              confirmId="admin-trab-password-confirm"
              passwordLabel="Contraseña (credencial de ingreso)"
              confirmLabel="Confirmar contraseña"
            />
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
                <th>Nombre</th>
                <th>Correo</th>
                <th>Ubicación</th>
                <th>Teléfono</th>
                <th>Cédula</th>
                <th>Base</th>
              </tr>
            </thead>
            <tbody>
              {trabajadores.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                    No hay trabajadores. Crea uno con el botón &quot;Crear trabajador&quot;.
                  </td>
                </tr>
              ) : (
                trabajadores.map((t) => (
                  <tr key={t.uid}>
                    <td>{t.displayName ?? "—"}</td>
                    <td>{t.email}</td>
                    <td>{t.lugar ?? "—"}</td>
                    <td>{t.telefono ?? "—"}</td>
                    <td>{t.cedula ?? "—"}</td>
                    <td>{t.base ?? "—"}</td>
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
