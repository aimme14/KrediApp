"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, createUser } from "@/lib/users";
import { listRutas, type RutaItem } from "@/lib/empresa-api";
import type { UserProfile } from "@/types/roles";

export default function EmpleadoPage() {
  const { user, profile } = useAuth();
  const [trabajadores, setTrabajadores] = useState<UserProfile[]>([]);
  const [rutas, setRutas] = useState<RutaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [base, setBase] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      listRutas(token).then(setRutas).catch(() => {});
    });
  }, [user]);

  const handleCreateTrabajador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setCreating(true);
    if (!rutaId.trim()) {
      setError("Debes seleccionar una ruta para el empleado");
      return;
    }
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
        rutaId: rutaId.trim(),
      });
      setDisplayName("");
      setUbicacion("");
      setDireccion("");
      setTelefono("");
      setCedula("");
      setBase("");
      setRutaId("");
      setEmail("");
      setPassword("");
      setShowForm(false);
      const list = await listUsersByCreator(profile.uid, "trabajador");
      setTrabajadores(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear empleado");
    } finally {
      setCreating(false);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Empleado</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Crea empleados con nombre, ubicación, dirección, teléfono, cédula, base, ruta, correo y contraseña (credenciales de ingreso).
      </p>

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancelar" : "Nuevo empleado"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Nuevo empleado</h3>
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
              <label>Base</label>
              <input
                type="text"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="Base asignada"
              />
            </div>
            <div className="form-group">
              <label>Ruta asignada</label>
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
            <div className="form-group">
              <label>Contraseña (credencial de ingreso)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Creando..." : "Crear empleado"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Empleados creados por mí</h3>
        {loading ? (
          <p>Cargando...</p>
        ) : (
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
                      No hay empleados. Crea uno con el botón &quot;Nuevo empleado&quot;.
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
        )}
      </div>
    </div>
  );
}
