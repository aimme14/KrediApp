"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { asignarBaseEmpleadoDesdeRuta } from "@/lib/empresa-api";
import { formatMontoEnteroInput, parseMontoEnteroFormatted } from "@/lib/monto-input-es";
import { guardOfflineWrite, useOnline } from "@/hooks/useOnline";

type AsignarBasePendiente = {
  rutaId: string;
  empleadoUid: string;
  empleadoNombre: string;
  rutaNombre: string;
  monto: number;
};

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function initialsFromNombre(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function RutaDelDiaPage() {
  const { user, profile } = useAuth();
  const online = useOnline();
  const { rutasConEmpleados, loading, error: ctxError } = useAdminDashboard();

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [montosAsignar, setMontosAsignar] = useState<Record<string, string>>({});
  const [asignandoKey, setAsignandoKey] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<AsignarBasePendiente | null>(null);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4200);
    return () => clearTimeout(t);
  }, [successMsg]);

  const asignarKey = (rutaId: string, empleadoUid: string) => `${rutaId}:${empleadoUid}`;

  const cerrarModalConfirmacion = useCallback(() => {
    if (asignandoKey) return;
    setConfirmModal(null);
  }, [asignandoKey]);

  useEffect(() => {
    if (!confirmModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarModalConfirmacion();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmModal, cerrarModalConfirmacion]);

  const abrirConfirmacionAsignar = (
    rutaId: string,
    empleadoUid: string,
    empleadoNombre: string,
    rutaNombre: string
  ) => {
    if (!guardOfflineWrite(online, setError)) return;
    const key = asignarKey(rutaId, empleadoUid);
    const monto = parseMontoEnteroFormatted(montosAsignar[key] ?? "");
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("Ingresa un monto válido mayor a cero");
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setConfirmModal({ rutaId, empleadoUid, empleadoNombre, rutaNombre, monto });
  };

  const ejecutarAsignacionConfirmada = async () => {
    if (!guardOfflineWrite(online, setError)) return;
    if (!user || !confirmModal) return;
    const { rutaId, empleadoUid, monto } = confirmModal;
    const key = asignarKey(rutaId, empleadoUid);
    setAsignandoKey(key);
    try {
      const token = await user.getIdToken();
      await asignarBaseEmpleadoDesdeRuta(token, rutaId, { empleadoUid, monto });
      setMontosAsignar((prev) => ({ ...prev, [key]: "" }));
      setSuccessMsg("Base asignada correctamente a la caja del trabajador.");
      setConfirmModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al asignar");
      setConfirmModal(null);
    } finally {
      setAsignandoKey(null);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  const displayError = error ?? ctxError;

  return (
    <>
    <div className="ruta-dia-page card">
      <header className="ruta-dia-head">
        <h2 className="ruta-dia-title">Ruta del día</h2>
      </header>

      {successMsg && (
        <p className="ruta-dia-success" role="status">
          {successMsg}
        </p>
      )}
      {displayError && (
        <p className="error-msg" role="alert">
          {displayError}
        </p>
      )}

      {loading ? (
        <div className="ruta-dia-skeleton" aria-busy="true" aria-label="Cargando rutas">
          <div className="ruta-dia-skeleton-card" />
          <div className="ruta-dia-skeleton-rows">
            <div className="ruta-dia-skeleton-row" />
            <div className="ruta-dia-skeleton-row" />
          </div>
        </div>
      ) : rutasConEmpleados.length === 0 ? (
        <div className="ruta-dia-empty">
          <span className="ruta-dia-empty-icon" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <p className="ruta-dia-empty-title">No hay rutas todavía</p>
          <p className="ruta-dia-empty-text">
            Creá al menos una ruta para verla aquí y asignar base a tus trabajadores.
          </p>
          <Link href="/dashboard/admin/rutas" className="btn btn-primary ruta-dia-empty-link">
            Ir a Rutas
          </Link>
        </div>
      ) : (
        <div className="ruta-dia-rutas">
          {rutasConEmpleados.map((r) => (
            <article key={r.id} className="ruta-dia-ruta-card">
              <div className="ruta-dia-ruta-head">
                {r.codigo && (
                  <code className="user-code ruta-code" title="Código de ruta">
                    {r.codigo}
                  </code>
                )}
                <div className="ruta-dia-ruta-titles">
                  <h3 className="ruta-dia-ruta-nombre">{r.nombre}</h3>
                  {r.ubicacion && <p className="ruta-dia-ruta-ubic">{r.ubicacion}</p>}
                </div>
              </div>

              <div className="ruta-dia-caja-wrap">
                <div className="ruta-dia-caja-metric">
                  <div className="ruta-dia-caja-main">
                    <span className="ruta-dia-caja-label">Caja de la ruta</span>
                    <span className="ruta-dia-caja-value">{formatMonto(r.cajaRuta ?? 0)}</span>
                  </div>
                  <span className="admin-inicio-metric-icon admin-inicio-metric-icon--purple" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </span>
                </div>
                {(r.cajaRuta ?? 0) <= 0 && (
                  <p className="ruta-dia-caja-hint">No hay saldo en la caja de esta ruta para asignar.</p>
                )}
              </div>

              {r.empleados.length === 0 ? (
                <p className="ruta-dia-no-emp">
                  Asigná un trabajador a esta ruta desde{" "}
                  <Link href="/dashboard/admin/empleado" className="ruta-dia-inline-link">
                    Empleado
                  </Link>{" "}
                  para poder entregarle base.
                </p>
              ) : (
                <div className="ruta-dia-empleados">
                  <p className="ruta-dia-empleados-label">Trabajadores en la ruta</p>
                  {r.empleados.map((emp) => {
                    const key = asignarKey(r.id, emp.uid);
                    const busy = asignandoKey === key;
                    return (
                      <div key={emp.uid} className="ruta-dia-emp-row">
                        <div className="ruta-dia-emp-id">
                          <span className="ruta-dia-emp-avatar" aria-hidden>
                            {initialsFromNombre(emp.nombre)}
                          </span>
                          <span className="ruta-dia-emp-nombre">{emp.nombre}</span>
                        </div>
                        <div className="ruta-dia-emp-panel">
                          <div className="ruta-dia-emp-monto-block">
                            <label className="ruta-dia-emp-label" htmlFor={`monto-${key}`}>
                              Monto
                            </label>
                            <input
                              id={`monto-${key}`}
                              type="text"
                              className="ruta-dia-emp-input"
                              inputMode="decimal"
                              placeholder="Ej: 150000"
                              value={montosAsignar[key] ?? ""}
                              disabled={busy || !!confirmModal || !online}
                              onChange={(e) =>
                                setMontosAsignar((prev) => ({
                                  ...prev,
                                  [key]: formatMontoEnteroInput(e.target.value),
                                }))
                              }
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary ruta-dia-emp-btn"
                            disabled={busy || !!confirmModal || (r.cajaRuta ?? 0) <= 0 || !online}
                            onClick={() =>
                              abrirConfirmacionAsignar(r.id, emp.uid, emp.nombre, r.nombre)
                            }
                          >
                            {busy ? "Asignando…" : "Asignar a caja del trabajador"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>

    {confirmModal && (
      <div
        className="gf-modal-backdrop gf-modal-backdrop--inversion"
        onClick={cerrarModalConfirmacion}
        role="presentation"
      >
        <div
          className="gf-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ruta-dia-asignar-modal-title"
          aria-describedby="ruta-dia-asignar-modal-desc"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="ruta-dia-asignar-modal-title" className="gf-modal-title">
            ¿Confirmar asignación de base?
          </h2>
          <p id="ruta-dia-asignar-modal-desc" className="gf-modal-desc">
            Se transferirá efectivo desde la caja de la ruta hacia la caja del trabajador. Revisá
            los datos antes de continuar.
          </p>
          <div className="gf-inversion-confirm-resumen">
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Ruta</span>
              <span className="gf-inversion-confirm-value">{confirmModal.rutaNombre}</span>
            </div>
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Trabajador</span>
              <span className="gf-inversion-confirm-value">{confirmModal.empleadoNombre}</span>
            </div>
            <div className="gf-inversion-confirm-row">
              <span className="gf-inversion-confirm-label">Monto a asignar</span>
              <span className="gf-inversion-confirm-value gf-inversion-confirm-value--monto">
                {formatMonto(confirmModal.monto)}
              </span>
            </div>
          </div>
          <div className="gf-modal-actions gf-modal-actions--inversion">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={cerrarModalConfirmacion}
              disabled={!!asignandoKey || !online}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void ejecutarAsignacionConfirmada()}
              disabled={!!asignandoKey || !online}
              aria-busy={!!asignandoKey}
            >
              {asignandoKey ? "Asignando…" : "Confirmar asignación"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
