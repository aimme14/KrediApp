"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listAllJefes,
  listAllAdminEmpresa,
  setJefeEnabled,
  setAdminEmpresaEnabled,
  fetchEmpresasAcceso,
  setEmpresaAccesoHasta,
  createUser,
  type EmpresaAccesoInfo,
} from "@/lib/users";
import type { UserProfile } from "@/types/roles";
import PasswordCreateFields from "@/components/PasswordCreateFields";

type SuperAdminTab = "jefes" | "adminEmpresa";

function etiquetaAcceso(info: EmpresaAccesoInfo | undefined): string {
  if (!info?.accesoHasta) return "Sin límite";
  if (info.vencido) return "Vencido";
  const dias = info.diasRestantes;
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}

function claseBadgeAcceso(info: EmpresaAccesoInfo | undefined): string {
  if (!info?.accesoHasta) return "sa-badge sa-badge--muted";
  if (info.vencido) return "sa-badge sa-badge--danger";
  if ((info.diasRestantes ?? 99) <= 3) return "sa-badge sa-badge--warn";
  return "sa-badge sa-badge--ok";
}

function inicialNombre(u: UserProfile): string {
  const base = (u.displayName || u.email || "?").trim();
  return base.charAt(0).toUpperCase();
}

export default function SuperAdminDashboard() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<SuperAdminTab>("jefes");
  const [jefes, setJefes] = useState<UserProfile[]>([]);
  const [adminEmpresa, setAdminEmpresa] = useState<UserProfile[]>([]);
  const [accesos, setAccesos] = useState<Record<string, EmpresaAccesoInfo>>({});
  const [fechasEdit, setFechasEdit] = useState<Record<string, string>>({});
  const [savingFechaUid, setSavingFechaUid] = useState<string | null>(null);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadAccesos = useCallback(
    async (empresaIds: string[]) => {
      if (!profile || empresaIds.length === 0) {
        return [] as string[];
      }
      const { accesos: map, empresasDeshabilitadas } = await fetchEmpresasAcceso(
        profile.uid,
        empresaIds
      );
      setAccesos(map);
      setFechasEdit((prev) => {
        const next = { ...prev };
        for (const id of empresaIds) {
          next[id] = map[id]?.accesoHasta ?? "";
        }
        return next;
      });
      return empresasDeshabilitadas;
    },
    [profile]
  );

  const loadLists = async () => {
    const [jefesList, adminEmpresaList] = await Promise.all([listAllJefes(), listAllAdminEmpresa()]);
    const ids = [...jefesList.map((j) => j.uid), ...adminEmpresaList.map((a) => a.uid)];
    const deshabilitadas = await loadAccesos(ids);

    if (deshabilitadas.length > 0) {
      const [jefesRefresh, adminRefresh] = await Promise.all([
        listAllJefes(),
        listAllAdminEmpresa(),
      ]);
      setJefes(jefesRefresh);
      setAdminEmpresa(adminRefresh);
    } else {
      setJefes(jefesList);
      setAdminEmpresa(adminEmpresaList);
    }
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
    setTogglingUid(jefe.uid);
    try {
      await setJefeEnabled(jefe.uid, !jefe.enabled, profile.uid);
      setJefes((prev) =>
        prev.map((u) => (u.uid === jefe.uid ? { ...u, enabled: !u.enabled } : u))
      );
      await loadAccesos([jefe.uid]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setTogglingUid(null);
    }
  };

  const handleToggleAdminEmpresa = async (admin: UserProfile) => {
    if (!profile) return;
    setError(null);
    setTogglingUid(admin.uid);
    try {
      await setAdminEmpresaEnabled(admin.uid, !admin.enabled, profile.uid);
      setAdminEmpresa((prev) =>
        prev.map((u) => (u.uid === admin.uid ? { ...u, enabled: !u.enabled } : u))
      );
      await loadAccesos([admin.uid]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setTogglingUid(null);
    }
  };

  const handleGuardarFecha = async (empresaId: string) => {
    if (!profile) return;
    setError(null);
    setSavingFechaUid(empresaId);
    try {
      const raw = fechasEdit[empresaId] ?? "";
      const accesoHasta = raw.trim() === "" ? null : raw.trim();
      const result = await setEmpresaAccesoHasta(empresaId, accesoHasta, profile.uid);
      setAccesos((prev) => ({ ...prev, [empresaId]: result }));
      setFechasEdit((prev) => ({ ...prev, [empresaId]: result.accesoHasta ?? "" }));
      if (result.deshabilitadoPorVencimiento) {
        await loadLists();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar fecha");
    } finally {
      setSavingFechaUid(null);
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
  const listaActual = tab === "jefes" ? jefes : adminEmpresa;
  const habilitados = listaActual.filter((u) => u.enabled).length;

  if (loading) {
    return (
      <div className="card sa-panel">
        <p className="sa-loading">Cargando panel…</p>
      </div>
    );
  }

  return (
    <div className="sa-panel">
      <div className="card sa-toolbar-card">
        <div className="sa-toolbar">
          <nav className="sa-tabs" role="tablist" aria-label="Gestión super admin">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "jefes"}
              className={`sa-tab ${tab === "jefes" ? "sa-tab--active" : ""}`}
              onClick={() => {
                setTab("jefes");
                setShowForm(false);
                setError(null);
              }}
            >
              Jefes
              <span className="sa-tab-count">{jefes.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "adminEmpresa"}
              className={`sa-tab ${tab === "adminEmpresa" ? "sa-tab--active" : ""}`}
              onClick={() => {
                setTab("adminEmpresa");
                setShowForm(false);
                setError(null);
              }}
            >
              Admin. empresa
              <span className="sa-tab-count">{adminEmpresa.length}</span>
            </button>
          </nav>
          <button
            type="button"
            className="btn btn-primary sa-create-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancelar" : createLabel}
          </button>
        </div>
        <p className="sa-hint">
          <strong>Acceso hasta</strong> es el día de pago. Si llega esa fecha sin extenderla, se
          deshabilita sola toda la empresa. Si pagan antes, cambia la fecha.
        </p>
      </div>

      {showForm && (
        <div className="card sa-form-card">
          <h3 className="sa-form-title">{formTitle}</h3>
          {tab === "adminEmpresa" ? (
            <p className="sa-form-lead">
              Cuenta independiente del jefe: opera como administrador y puede ingresar dinero a su
              propia base.
            </p>
          ) : null}
          <form onSubmit={handleCreate} className="sa-form">
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

      {!showForm && error && <p className="error-msg sa-error">{error}</p>}

      <div className="card sa-list-card">
        <div className="sa-list-head">
          <div>
            <h3 className="sa-list-title">
              {tab === "jefes" ? "Jefes" : "Administradores de empresa"}
            </h3>
            <p className="sa-list-sub">
              {listaActual.length === 0
                ? "Sin registros"
                : `${habilitados} activos · ${listaActual.length} en total`}
            </p>
          </div>
        </div>

        {listaActual.length === 0 ? (
          <div className="sa-empty">
            <p className="sa-empty-title">
              {tab === "jefes" ? "Aún no hay jefes" : "Aún no hay administradores de empresa"}
            </p>
            <p className="sa-empty-text">
              Usa el botón &quot;{createLabel}&quot; para crear el primero.
            </p>
          </div>
        ) : (
          <ul className="sa-list">
            {listaActual.map((u) => {
              const info = accesos[u.uid];
              const fechaDirty = (fechasEdit[u.uid] ?? "") !== (info?.accesoHasta ?? "");
              return (
                <li
                  key={u.uid}
                  className={`sa-item ${u.enabled ? "" : "sa-item--off"}`}
                >
                  <div className="sa-item-main">
                    <div className="sa-avatar" aria-hidden>
                      {inicialNombre(u)}
                    </div>
                    <div className="sa-item-identity">
                      <div className="sa-item-name-row">
                        <span className="sa-item-name">{u.displayName || "Sin nombre"}</span>
                        <code
                          className="user-code sa-code"
                          title={tab === "jefes" ? "JF = Jefe" : "AE = Admin empresa"}
                        >
                          {u.codigo ?? "—"}
                        </code>
                      </div>
                      <span className="sa-item-email">{u.email}</span>
                      <div className="sa-item-badges">
                        <span className={u.enabled ? "sa-badge sa-badge--ok" : "sa-badge sa-badge--danger"}>
                          {u.enabled ? "Habilitado" : "Deshabilitado"}
                        </span>
                        <span className={claseBadgeAcceso(info)}>{etiquetaAcceso(info)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="sa-item-controls">
                    <label className="sa-date-field">
                      <span className="sa-date-label">Acceso hasta</span>
                      <div className="sa-date-row">
                        <input
                          type="date"
                          className="sa-date-input"
                          value={fechasEdit[u.uid] ?? ""}
                          onChange={(e) =>
                            setFechasEdit((prev) => ({ ...prev, [u.uid]: e.target.value }))
                          }
                          aria-label={`Acceso hasta ${u.email}`}
                        />
                        <button
                          type="button"
                          className={`btn btn-secondary sa-save-btn ${fechaDirty ? "sa-save-btn--dirty" : ""}`}
                          disabled={savingFechaUid === u.uid || !fechaDirty}
                          onClick={() => void handleGuardarFecha(u.uid)}
                        >
                          {savingFechaUid === u.uid ? "…" : "Guardar"}
                        </button>
                      </div>
                    </label>

                    <button
                      type="button"
                      className={`btn sa-toggle-btn ${u.enabled ? "btn-danger" : "btn-success"}`}
                      disabled={togglingUid === u.uid}
                      onClick={() =>
                        void (tab === "jefes" ? handleToggleJefe(u) : handleToggleAdminEmpresa(u))
                      }
                    >
                      {togglingUid === u.uid
                        ? "…"
                        : u.enabled
                          ? "Deshabilitar"
                          : "Habilitar"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
