"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, createUser } from "@/lib/users";
import { listRutas, updateEmpleado, type RutaItem } from "@/lib/empresa-api";
import type { UserProfile } from "@/types/roles";
import PasswordCreateFields from "@/components/PasswordCreateFields";
import { guardOfflineWrite, useOnline } from "@/hooks/useOnline";
import { isAdminPanelRole } from "@/lib/admin-panel-role";

export default function EmpleadoAdminPageContent() {
  const { user, profile } = useAuth();
  const online = useOnline();
  const [trabajadores, setTrabajadores] = useState<UserProfile[]>([]);
  const [rutasLibres, setRutasLibres] = useState<RutaItem[]>([]);
  const [todasRutas, setTodasRutas] = useState<RutaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [creating, setCreating] = useState(false);

  const [empleadoEditando, setEmpleadoEditando] = useState<UserProfile | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editUbicacion, setEditUbicacion] = useState("");
  const [editDireccion, setEditDireccion] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editCedula, setEditCedula] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const rutaPorId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of todasRutas) m[r.id] = r.nombre;
    return m;
  }, [todasRutas]);

  const refreshLista = useCallback(async () => {
    if (!profile || !user) return;
    const [list, token] = await Promise.all([
      listUsersByCreator(profile.uid, "trabajador"),
      user.getIdToken(),
    ]);
    setTrabajadores(list);
    const [libres, todas] = await Promise.all([
      listRutas(token, { sinEmpleado: true }),
      listRutas(token),
    ]);
    setRutasLibres(libres);
    setTodasRutas(todas);
  }, [profile, user]);

  useEffect(() => {
    if (!profile || !user) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshLista();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, user, refreshLista]);

  const cerrarEdicion = useCallback(() => {
    setEmpleadoEditando(null);
    setEditError(null);
    setSavingEdit(false);
  }, []);

  const abrirEdicion = useCallback((t: UserProfile) => {
    setEmpleadoEditando(t);
    setEditNombre(t.displayName ?? "");
    setEditUbicacion(t.lugar ?? "");
    setEditDireccion(t.direccion ?? "");
    setEditTelefono(t.telefono ?? "");
    setEditCedula(t.cedula ?? "");
    setEditError(null);
  }, []);

  useEffect(() => {
    if (!empleadoEditando) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !savingEdit) cerrarEdicion();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [empleadoEditando, savingEdit, cerrarEdicion]);

  const handleCreateTrabajador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardOfflineWrite(online, setError)) return;
    if (!profile || !user) return;
    setError(null);
    if (!rutaId.trim()) {
      setError("Debes seleccionar una ruta para el empleado");
      return;
    }
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
        adminId: profile.uid,
        cedula: cedula.trim() || undefined,
        lugar: ubicacion.trim() || undefined,
        direccion: direccion.trim() || undefined,
        telefono: telefono.trim() || undefined,
        rutaId: rutaId.trim(),
      });
      setDisplayName("");
      setUbicacion("");
      setDireccion("");
      setTelefono("");
      setCedula("");
      setRutaId("");
      setEmail("");
      setPassword("");
      setPasswordConfirm("");
      setShowForm(false);
      await refreshLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear empleado");
    } finally {
      setCreating(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardOfflineWrite(online, setEditError)) return;
    if (!user || !empleadoEditando) return;
    if (!editNombre.trim()) {
      setEditError("El nombre es obligatorio");
      return;
    }
    setEditError(null);
    setSavingEdit(true);
    try {
      const token = await user.getIdToken();
      await updateEmpleado(token, empleadoEditando.uid, {
        displayName: editNombre.trim(),
        lugar: editUbicacion.trim(),
        direccion: editDireccion.trim(),
        telefono: editTelefono.trim(),
        cedula: editCedula.trim(),
      });
      cerrarEdicion();
      await refreshLista();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Error al actualizar empleado");
    } finally {
      setSavingEdit(false);
    }
  };

  if (!profile || !isAdminPanelRole(profile.role)) return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Empleado</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Crea empleados con nombre, ubicación, dirección, teléfono, cédula, ruta, correo y contraseña (credenciales de ingreso).
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
              <label>Ruta asignada</label>
              <select
                value={rutaId}
                onChange={(e) => setRutaId(e.target.value)}
                required
                style={{ width: "100%", padding: "0.5rem" }}
              >
                <option value="">Seleccionar ruta</option>
                {rutasLibres.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre} {r.ubicacion ? `· ${r.ubicacion}` : ""}
                  </option>
                ))}
              </select>
              {rutasLibres.length === 0 && (
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.35rem", marginBottom: 0 }}>
                  No hay rutas libres. Crea una ruta nueva o espera a liberar una (un trabajador por ruta).
                </p>
              )}
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
              passwordId="admin-emp-password"
              confirmId="admin-emp-password-confirm"
              passwordLabel="Contraseña (credencial de ingreso)"
              confirmLabel="Confirmar contraseña"
            />
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating || !online}>
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
                  <th className="admin-clientes-th-accion">Acción</th>
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
                      <td className="admin-clientes-td-accion">
                        <button
                          type="button"
                          className="admin-clientes-edit-btn"
                          onClick={() => abrirEdicion(t)}
                          aria-label={`Actualizar datos de ${t.displayName ?? t.email}`}
                          title="Actualizar datos"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {empleadoEditando && (
        <div
          className="gf-modal-backdrop"
          onClick={() => !savingEdit && cerrarEdicion()}
          role="presentation"
        >
          <div
            className="gf-modal gf-modal--cliente-edit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="empleado-edit-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="empleado-edit-modal-title" className="gf-modal-title">
              Actualizar datos
            </h2>
            <dl className="admin-clientes-edit-readonly">
              <div className="admin-clientes-edit-readonly-row">
                <dt className="admin-clientes-edit-readonly-label">Correo</dt>
                <dd className="admin-clientes-edit-readonly-value">
                  {empleadoEditando.email}
                </dd>
              </div>
              <div className="admin-clientes-edit-readonly-row">
                <dt className="admin-clientes-edit-readonly-label">Ruta</dt>
                <dd className="admin-clientes-edit-readonly-value">
                  {empleadoEditando.rutaId
                    ? (rutaPorId[empleadoEditando.rutaId] ?? empleadoEditando.rutaId)
                    : "—"}
                </dd>
              </div>
            </dl>

            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label htmlFor="empleado-edit-nombre">Nombre</label>
                <input
                  id="empleado-edit-nombre"
                  type="text"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  required
                  placeholder="Nombre completo"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="empleado-edit-ubicacion">Ubicación</label>
                <input
                  id="empleado-edit-ubicacion"
                  type="text"
                  value={editUbicacion}
                  onChange={(e) => setEditUbicacion(e.target.value)}
                  placeholder="Ciudad o zona"
                />
              </div>
              <div className="form-group">
                <label htmlFor="empleado-edit-direccion">Dirección</label>
                <input
                  id="empleado-edit-direccion"
                  type="text"
                  value={editDireccion}
                  onChange={(e) => setEditDireccion(e.target.value)}
                  placeholder="Dirección física"
                />
              </div>
              <div className="form-group">
                <label htmlFor="empleado-edit-telefono">Teléfono</label>
                <input
                  id="empleado-edit-telefono"
                  type="tel"
                  value={editTelefono}
                  onChange={(e) => setEditTelefono(e.target.value)}
                  placeholder="Número de contacto"
                />
              </div>
              <div className="form-group">
                <label htmlFor="empleado-edit-cedula">Cédula</label>
                <input
                  id="empleado-edit-cedula"
                  type="text"
                  value={editCedula}
                  onChange={(e) => setEditCedula(e.target.value)}
                  placeholder="Número de cédula"
                />
              </div>
              {editError && <p className="error-msg">{editError}</p>}
              <div className="gf-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={cerrarEdicion}
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEdit || !online}
                  aria-busy={savingEdit}
                >
                  {savingEdit ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
