"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, createUser } from "@/lib/users";
import type { UserProfile } from "@/types/roles";

function IconSearch() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/** Filtra administradores por término (nombre, código, correo). */
function filterAdmins(list: UserProfile[], term: string): UserProfile[] {
  const q = term.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (a) =>
      (a.displayName ?? "").toLowerCase().includes(q) ||
      (a.codigo ?? "").toLowerCase().includes(q) ||
      (a.email ?? "").toLowerCase().includes(q)
  );
}

export default function AdministradoresPage() {
  const { profile } = useAuth();
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    displayName: "",
    cedula: "",
    lugar: "",
    base: "",
    email: "",
    password: "",
    montoAsignado: "",
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

  const filteredAdmins = useMemo(() => filterAdmins(admins, filter), [admins, filter]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSuccess(false);
    setCreating(true);
    try {
      const montoNum = form.montoAsignado.trim() ? parseFloat(form.montoAsignado.replace(",", ".")) : undefined;
      await createUser({
        email: form.email,
        password: form.password,
        displayName: form.displayName || undefined,
        role: "admin",
        createdByUid: profile.uid,
        cedula: form.cedula || undefined,
        lugar: form.lugar || undefined,
        base: form.base || undefined,
        montoAsignado: typeof montoNum === "number" && !Number.isNaN(montoNum) && montoNum > 0 ? montoNum : undefined,
      });
      setForm({ displayName: "", cedula: "", lugar: "", base: "", email: "", password: "", montoAsignado: "" });
      setShowForm(false);
      const list = await listUsersByCreator(profile.uid, "admin");
      setAdmins(list);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear administrador");
    } finally {
      setCreating(false);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setError(null);
  };

  if (loading) {
    return (
      <div className="card admin-jefe-table-card">
        <div className="card-header-row admin-jefe-table-header">
          <div className="admin-jefe-skeleton-title" style={{ width: "140px" }} />
          <div className="admin-jefe-skeleton-btn" />
        </div>
        <div className="admin-jefe-table-skeleton">
          <div className="admin-jefe-skeleton-row" />
          <div className="admin-jefe-skeleton-row" />
          <div className="admin-jefe-skeleton-row" />
          <div className="admin-jefe-skeleton-row" />
        </div>
        <span className="visually-hidden">Cargando administradores...</span>
      </div>
    );
  }

  return (
    <>
      {showForm && (
        <div className="card admin-jefe-form-card">
          <div className="card-header-row admin-jefe-form-header">
            <h2 className="admin-jefe-form-title">Nuevo administrador</h2>
            <button
              type="button"
              className="admin-jefe-form-close"
              onClick={handleCloseForm}
              disabled={creating}
              aria-label="Cerrar y cancelar"
              title="Cerrar y cancelar"
            >
              <IconClose />
            </button>
          </div>
          <form onSubmit={handleCreateAdmin} className="admin-jefe-form" noValidate>
            <div className="admin-jefe-form-grid">
              <div className="form-group">
                <label htmlFor="admin-displayName" className="admin-jefe-label">NOMBRE</label>
                <input
                  id="admin-displayName"
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Nombre completo"
                  className="admin-jefe-input"
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="admin-cedula" className="admin-jefe-label">CÉDULA</label>
                <input
                  id="admin-cedula"
                  type="text"
                  value={form.cedula}
                  onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value }))}
                  placeholder="Número de cédula"
                  className="admin-jefe-input"
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label htmlFor="admin-lugar" className="admin-jefe-label">LUGAR</label>
                <input
                  id="admin-lugar"
                  type="text"
                  value={form.lugar}
                  onChange={(e) => setForm((f) => ({ ...f, lugar: e.target.value }))}
                  placeholder="Ciudad o zona"
                  className="admin-jefe-input"
                  autoComplete="address-level2"
                />
              </div>
              <div className="form-group">
                <label htmlFor="admin-base" className="admin-jefe-label">BASE</label>
                <input
                  id="admin-base"
                  type="text"
                  value={form.base}
                  onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))}
                  placeholder="Base o sede asignada"
                  className="admin-jefe-input"
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label htmlFor="admin-email" className="admin-jefe-label">CORREO *</label>
                <input
                  id="admin-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  placeholder="correo@ejemplo.com"
                  className="admin-jefe-input"
                  autoComplete="email"
                  aria-required="true"
                />
              </div>
              <div className="form-group">
                <label htmlFor="admin-montoAsignado" className="admin-jefe-label">CAPITAL A ASIGNAR (OPCIONAL)</label>
                <input
                  id="admin-montoAsignado"
                  type="text"
                  inputMode="decimal"
                  value={form.montoAsignado}
                  onChange={(e) => setForm((f) => ({ ...f, montoAsignado: e.target.value }))}
                  placeholder="Ej: 5000000 (sale de caja empresa)"
                  className="admin-jefe-input"
                />
                <span className="admin-jefe-hint">Si ingresas un monto, se descontará de tu caja empresa y quedará como capital del administrador.</span>
              </div>
              <div className="form-group">
                <label htmlFor="admin-password" className="admin-jefe-label">CONTRASEÑA *</label>
                <input
                  id="admin-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="admin-jefe-input"
                  autoComplete="new-password"
                  aria-required="true"
                />
              </div>
            </div>
            {error && (
              <div className="admin-jefe-msg admin-jefe-msg-error" role="alert">
                {error}
              </div>
            )}
            <footer className="admin-jefe-form-footer">
              <span className="admin-jefe-required-hint">* Campos requeridos</span>
              <div className="admin-jefe-form-actions">
                <button type="button" className="btn btn-secondary" onClick={handleCloseForm} disabled={creating}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating} title="Crear administrador">
                  {creating ? "Creando..." : "Crear administrador"}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}

      {success && (
        <div className="admin-jefe-msg admin-jefe-msg-success" role="status">
          Administrador creado correctamente.
        </div>
      )}

      {!showForm && error && (
        <div className="admin-jefe-msg admin-jefe-msg-error" role="alert">
          {error}
        </div>
      )}

      {!showForm && (
      <div className="card admin-jefe-table-card">
        <div className="card-header-row admin-jefe-table-header">
          <h2 className="admin-jefe-table-title" id="admin-jefe-title">
            Administradores
            <span className="admin-jefe-table-count" aria-label={`${admins.length} en total`}>
              ({admins.length})
            </span>
          </h2>
          <button
            type="button"
            className="btn btn-primary admin-jefe-btn-create"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
            aria-label={showForm ? "Cerrar formulario" : "Crear administrador"}
            title={showForm ? "Cancelar" : "Crear administrador"}
          >
            <IconPlus aria-hidden />
            {showForm ? "Cancelar" : "Crear administrador"}
          </button>
        </div>
        <div className="admin-jefe-filter-wrap">
          <label htmlFor="admin-filter" className="visually-hidden">Buscar por nombre, código o correo</label>
          <span className="admin-jefe-filter-icon" aria-hidden>
            <IconSearch />
          </span>
          <input
            id="admin-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por nombre, código o correo..."
            className="admin-jefe-filter-input"
            autoComplete="off"
            aria-label="Buscar por nombre, código o correo"
          />
        </div>
        <div className="table-wrap">
          <table className="admin-jefe-table" role="table" aria-label="Lista de administradores creados por el jefe">
            <caption className="visually-hidden">Administradores creados por mí</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nombre</th>
                <th scope="col">Cédula</th>
                <th scope="col">Lugar</th>
                <th scope="col">Base</th>
                <th scope="col">Correo</th>
                <th scope="col">Creado por</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-jefe-empty-cell">
                    {admins.length === 0 ? (
                      <>No hay administradores. Usa el botón &quot;Crear administrador&quot; para agregar uno.</>
                    ) : (
                      <>No hay resultados para &quot;{filter.trim()}&quot;. Prueba otro término.</>
                    )}
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((a) => (
                  <tr key={a.uid}>
                    <td>
                      <code className="user-code admin-jefe-code" title="Código del administrador (AD = Admin)">
                        {a.codigo ?? "—"}
                      </code>
                    </td>
                    <td>{a.displayName ?? "—"}</td>
                    <td>{a.cedula ?? "—"}</td>
                    <td>{a.lugar ?? "—"}</td>
                    <td>{a.base ?? "—"}</td>
                    <td className="admin-jefe-email">{a.email}</td>
                    <td title="Código del jefe que creó a este administrador">{a.jefeCodigo ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </>
  );
}
