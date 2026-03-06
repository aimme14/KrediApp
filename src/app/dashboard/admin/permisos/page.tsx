"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator } from "@/lib/users";
import { setEmpleadoEnabled } from "@/lib/empresa-api";
import type { UserProfile } from "@/types/roles";

export default function PermisosPage() {
  const { user, profile } = useAuth();
  const [empleados, setEmpleados] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingUid, setTogglingUid] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    listUsersByCreator(profile.uid, "trabajador")
      .then((list) => {
        if (!cancelled) setEmpleados(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  const handleToggle = async (empleado: UserProfile) => {
    if (!user) return;
    setError(null);
    setTogglingUid(empleado.uid);
    try {
      const token = await user.getIdToken();
      await setEmpleadoEnabled(token, empleado.uid, !empleado.enabled);
      setEmpleados((prev) =>
        prev.map((u) => (u.uid === empleado.uid ? { ...u, enabled: !u.enabled } : u))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setTogglingUid(null);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Permisos</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Activa o deshabilita a los empleados para que puedan acceder o no al programa.
      </p>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando empleados...</p>
      ) : empleados.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No hay empleados. Créalos en la sección &quot;Empleado&quot;.
        </p>
      ) : (
        <ul className="jefe-permisos-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {empleados.map((e) => (
            <li key={e.uid} className="jefe-permisos-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", padding: "0.75rem 0", borderBottom: "1px solid var(--border)" }}>
              <div className="jefe-permisos-info">
                <span className="jefe-permisos-name">{e.displayName || e.email}</span>
                <span className="jefe-permisos-email" style={{ display: "block", fontSize: "0.875rem", color: "var(--text-muted)" }}>{e.email}</span>
              </div>
              <span className={e.enabled ? "badge badge-enabled" : "badge badge-disabled"}>
                {e.enabled ? "Habilitado" : "Deshabilitado"}
              </span>
              <button
                type="button"
                className={`btn ${e.enabled ? "btn-danger" : "btn-success"}`}
                onClick={() => handleToggle(e)}
                disabled={togglingUid === e.uid}
              >
                {togglingUid === e.uid ? "..." : e.enabled ? "Deshabilitar" : "Habilitar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
