"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, setAdminEnabled } from "@/lib/users";
import type { UserProfile } from "@/types/roles";
import { guardOfflineWrite, useOnline } from "@/hooks/useOnline";

function IconShield() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconBan() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function adminInitial(admin: UserProfile): string {
  const n = (admin.displayName || admin.email || "?").trim();
  return n.charAt(0).toUpperCase() || "?";
}

export default function PermisosPage() {
  const { profile } = useAuth();
  const online = useOnline();
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const enabledCount = useMemo(() => admins.filter((a) => a.enabled).length, [admins]);

  const handleToggle = async (admin: UserProfile) => {
    if (!guardOfflineWrite(online, setError)) return;
    if (!profile) return;
    setError(null);
    setTogglingUid(admin.uid);
    try {
      await setAdminEnabled(admin.uid, !admin.enabled, profile.uid);
      setAdmins((prev) => prev.map((u) => (u.uid === admin.uid ? { ...u, enabled: !u.enabled } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setTogglingUid(null);
    }
  };

  if (loading) {
    return (
      <div className="jefe-permisos-page" aria-busy="true">
        <div className="jefe-permisos-hero card jefe-permisos-hero--loading">
          <div className="jefe-permisos-skel jefe-permisos-skel--icon" />
          <div className="jefe-permisos-skel-wrap">
            <div className="jefe-permisos-skel jefe-permisos-skel--line sm" />
            <div className="jefe-permisos-skel jefe-permisos-skel--line lg" />
            <div className="jefe-permisos-skel jefe-permisos-skel--line md" />
          </div>
        </div>
        <div className="card jefe-permisos-section jefe-permisos-section--loading">
          <div className="jefe-permisos-skel jefe-permisos-skel--line sm" style={{ width: "40%" }} />
          <div className="jefe-permisos-row-skel" />
          <div className="jefe-permisos-row-skel" />
        </div>
      </div>
    );
  }

  return (
    <div className="jefe-permisos-page">
      <header className="jefe-permisos-hero card">
        <div className="jefe-permisos-hero-icon" aria-hidden>
          <IconShield />
        </div>
        <div className="jefe-permisos-hero-text">
          <p className="jefe-permisos-eyebrow">Control de acceso</p>
          <h1 className="jefe-permisos-title">Permisos</h1>
          <p className="jefe-permisos-lead">
            Activa o desactiva el acceso de cada administrador a su panel. Un administrador deshabilitado no podrá iniciar
            sesión hasta que lo vuelvas a habilitar.
          </p>
        </div>
      </header>

      {error ? (
        <div className="jefe-permisos-alert" role="alert">
          {error}
        </div>
      ) : null}

      <section className="jefe-permisos-section card" aria-labelledby="jefe-permisos-admins-heading">
        <div className="jefe-permisos-section-head">
          <div className="jefe-permisos-section-head-left">
            <span className="jefe-permisos-section-icon" aria-hidden>
              <IconUsers />
            </span>
            <div>
              <h2 id="jefe-permisos-admins-heading" className="jefe-permisos-section-title">
                Administradores
              </h2>
              <p className="jefe-permisos-section-sub">
                {admins.length === 0
                  ? "Nadie en la lista todavía"
                  : `${enabledCount} habilitado${enabledCount === 1 ? "" : "s"} · ${admins.length} en total`}
              </p>
            </div>
          </div>
        </div>

        {admins.length === 0 ? (
          <div className="jefe-permisos-empty">
            <p className="jefe-permisos-empty-title">No hay administradores</p>
            <p className="jefe-permisos-empty-text">
              Crea primero cuentas de administrador en la sección correspondiente; luego podrás gestionar sus permisos
              aquí.
            </p>
            <Link href="/dashboard/jefe/administradores" className="jefe-permisos-empty-link">
              Ir a Administradores
            </Link>
          </div>
        ) : (
          <ul className="jefe-permisos-list">
            {admins.map((a) => (
              <li key={a.uid} className="jefe-permisos-item">
                <div className="jefe-permisos-avatar" aria-hidden>
                  {adminInitial(a)}
                </div>
                <div className="jefe-permisos-info">
                  <span className="jefe-permisos-name">{a.displayName || a.email}</span>
                  <span className="jefe-permisos-email">{a.email}</span>
                </div>
                <div className="jefe-permisos-actions">
                  <span className={`jefe-permisos-pill ${a.enabled ? "jefe-permisos-pill--on" : "jefe-permisos-pill--off"}`}>
                    {a.enabled ? "Acceso activo" : "Acceso bloqueado"}
                  </span>
                  <button
                    type="button"
                    className={`jefe-permisos-btn ${a.enabled ? "jefe-permisos-btn--danger" : "jefe-permisos-btn--success"}`}
                    onClick={() => handleToggle(a)}
                    disabled={togglingUid === a.uid || !online}
                    aria-busy={togglingUid === a.uid}
                    aria-label={a.enabled ? `Deshabilitar acceso de ${a.displayName || a.email}` : `Habilitar acceso de ${a.displayName || a.email}`}
                  >
                    {togglingUid === a.uid ? (
                      <span className="jefe-permisos-btn-spinner" aria-hidden />
                    ) : a.enabled ? (
                      <>
                        <IconBan />
                        Deshabilitar
                      </>
                    ) : (
                      <>
                        <IconCheck />
                        Habilitar
                      </>
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
