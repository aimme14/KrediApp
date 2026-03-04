"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator, setAdminEnabled } from "@/lib/users";
import type { UserProfile } from "@/types/roles";

export default function PermisosPage() {
  const { profile } = useAuth();
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
    return () => { cancelled = true; };
  }, [profile]);

  const handleToggle = async (admin: UserProfile) => {
    if (!profile) return;
    setError(null);
    setTogglingUid(admin.uid);
    try {
      await setAdminEnabled(admin.uid, !admin.enabled, profile.uid);
      setAdmins((prev) =>
        prev.map((u) => (u.uid === admin.uid ? { ...u, enabled: !u.enabled } : u))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setTogglingUid(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p>Cargando permisos...</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Permisos</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 0 }}>
          Habilita o deshabilita a los administradores para que puedan usar su perfil.
        </p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Administradores</h3>
        {admins.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No hay administradores. Créalos en la sección &quot;Administradores&quot;.
          </p>
        ) : (
          <ul className="jefe-permisos-list">
            {admins.map((a) => (
              <li key={a.uid} className="jefe-permisos-item">
                <div className="jefe-permisos-info">
                  <span className="jefe-permisos-name">{a.displayName || a.email}</span>
                  <span className="jefe-permisos-email">{a.email}</span>
                </div>
                <span className={a.enabled ? "badge badge-enabled" : "badge badge-disabled"}>
                  {a.enabled ? "Habilitado" : "Deshabilitado"}
                </span>
                <button
                  type="button"
                  className={`btn ${a.enabled ? "btn-danger" : "btn-success"}`}
                  onClick={() => handleToggle(a)}
                  disabled={togglingUid === a.uid}
                >
                  {togglingUid === a.uid ? "..." : a.enabled ? "Deshabilitar" : "Habilitar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
