"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listAllJefes,
  listAllAdminEmpresa,
  setJefeEnabled,
  setAdminEmpresaEnabled,
  createUser,
} from "@/lib/users";
import type { UserProfile } from "@/types/roles";
import PasswordCreateFields from "@/components/PasswordCreateFields";

type SuperAdminTab = "jefes" | "adminEmpresa";

export default function SuperAdminDashboard() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<SuperAdminTab>("jefes");
  const [jefes, setJefes] = useState<UserProfile[]>([]);
  const [adminEmpresa, setAdminEmpresa] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadLists = async () => {
    const [jefesList, adminEmpresaList] = await Promise.all([listAllJefes(), listAllAdminEmpresa()]);
    setJefes(jefesList);
    setAdminEmpresa(adminEmpresaList);
  };

  useEffect(() => {
    if (!profile || profile.role !== "superAdmin") return;
    let cancelled = false;
    loadLists()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const handleToggleJefe = async (jefe: UserProfile) => {
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

  const handleToggleAdminEmpresa = async (admin: UserProfile) => {
    if (!profile) return;
    setError(null);
    try {
      await setAdminEmpresaEnabled(admin.uid, !admin.enabled, profile.uid);
      setAdminEmpresa((prev) =>
        prev.map((u) => (u.uid === admin.uid ? { ...u, enabled: !u.enabled } : u))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setCreating(true);
    try {
      await createUser({
        email,
        password,
        displayName: displayName || undefined,
        role: tab === "jefes" ? "jefe" : "adminEmpresa",
        createdByUid: profile.uid,
      });
      setEmail("");
      setPassword("");
      setPasswordConfirm("");
      setDisplayName("");
      setShowForm(false);
      await loadLists();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : tab === "jefes"
            ? "Error al crear jefe"
            : "Error al crear administrador de empresa"
      );
    } finally {
      setCreating(false);
    }
  };

  const createLabel = tab === "jefes" ? "Crear jefe" : "Crear administrador de empresa";
  const formTitle = tab === "jefes" ? "Nuevo jefe" : "Nuevo administrador de empresa";

  if (loading) return <div className="card"><p>Cargando panel...</p></div>;

  return (
    <>
      <div className="card">
        <div className="card-header-row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
          <nav role="tablist" aria-label="Gestión super admin" style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "jefes"}
              className={`btn ${tab === "jefes" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setTab("jefes");
                setShowForm(false);
                setError(null);
              }}
            >
              Jefes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "adminEmpresa"}
              className={`btn ${tab === "adminEmpresa" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setTab("adminEmpresa");
                setShowForm(false);
                setError(null);
              }}
            >
              Administradores de empresa
            </button>
          </nav>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : createLabel}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{formTitle}</h3>
          {tab === "adminEmpresa" ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
              Cuenta independiente del jefe: opera como administrador y puede ingresar dinero a su
              propia base.
            </p>
          ) : null}
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <PasswordCreateFields
              password={password}
              passwordConfirm={passwordConfirm}
              onPasswordChange={setPassword}
              onPasswordConfirmChange={setPasswordConfirm}
              disabled={creating}
              passwordId={`super-${tab}-password`}
              confirmId={`super-${tab}-password-confirm`}
            />
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
              {creating ? "Creando..." : createLabel}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {tab === "jefes" ? "Jefes" : "Administradores de empresa"}
        </h3>
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
              {(tab === "jefes" ? jefes : adminEmpresa).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                    {tab === "jefes"
                      ? 'No hay jefes. Crea uno con el botón "Crear jefe".'
                      : 'No hay administradores de empresa. Crea uno con el botón correspondiente.'}
                  </td>
                </tr>
              ) : tab === "jefes" ? (
                jefes.map((j) => (
                  <tr key={j.uid}>
                    <td>
                      <code className="user-code" title="JF = Jefe">
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
                        onClick={() => handleToggleJefe(j)}
                      >
                        {j.enabled ? "Deshabilitar" : "Habilitar"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                adminEmpresa.map((a) => (
                  <tr key={a.uid}>
                    <td>
                      <code className="user-code" title="AE = Administrador de empresa">
                        {a.codigo ?? "—"}
                      </code>
                    </td>
                    <td>{a.email}</td>
                    <td>{a.displayName ?? "—"}</td>
                    <td>
                      <span className={a.enabled ? "badge badge-enabled" : "badge badge-disabled"}>
                        {a.enabled ? "Habilitado" : "Deshabilitado"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn ${a.enabled ? "btn-danger" : "btn-success"}`}
                        onClick={() => handleToggleAdminEmpresa(a)}
                      >
                        {a.enabled ? "Deshabilitar" : "Habilitar"}
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
