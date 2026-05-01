"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  getRutaDelDia,
  asignarBaseEmpleadoDesdeRuta,
  type RutaDelDiaItem,
} from "@/lib/empresa-api";
import { formatMontoEnteroInput, parseMontoEnteroFormatted } from "@/lib/monto-input-es";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function RutaDelDiaPage() {
  const { user, profile } = useAuth();
  const [rutaDelDia, setRutaDelDia] = useState<RutaDelDiaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [montosAsignar, setMontosAsignar] = useState<Record<string, string>>({});
  const [asignandoKey, setAsignandoKey] = useState<string | null>(null);

  const loadRutaDelDia = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const data = await getRutaDelDia(token);
      setRutaDelDia(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar ruta del día");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadRutaDelDia();
  }, [loadRutaDelDia]);

  const asignarKey = (rutaId: string, empleadoUid: string) => `${rutaId}:${empleadoUid}`;

  const handleAsignarBase = async (rutaId: string, empleadoUid: string) => {
    if (!user) return;
    const key = asignarKey(rutaId, empleadoUid);
    const raw = montosAsignar[key] ?? "";
    const monto = parseMontoEnteroFormatted(raw);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError("Ingresa un monto válido mayor a cero");
      return;
    }
    setError(null);
    setAsignandoKey(key);
    try {
      const token = await user.getIdToken();
      await asignarBaseEmpleadoDesdeRuta(token, rutaId, { empleadoUid, monto });
      setMontosAsignar((prev) => ({ ...prev, [key]: "" }));
      await loadRutaDelDia();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al asignar");
    } finally {
      setAsignandoKey(null);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Ruta del día</h2>
      {error && <p className="error-msg">{error}</p>}
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
      ) : rutaDelDia.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No tenés rutas creadas todavía.{" "}
          <Link href="/dashboard/admin/rutas" style={{ color: "var(--accent, #c94a4a)" }}>
            Creá una en Rutas
          </Link>
          .
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {rutaDelDia.map((r) => (
            <div
              key={r.id}
              className="card"
              style={{
                padding: "1rem",
                margin: 0,
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.5rem 1rem", marginBottom: "0.75rem" }}>
                {r.codigo && (
                  <code className="user-code ruta-code" title="Código de ruta">
                    {r.codigo}
                  </code>
                )}
                <span style={{ fontWeight: 600 }}>{r.nombre}</span>
                {r.ubicacion ? (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{r.ubicacion}</span>
                ) : null}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: "0.65rem",
                  marginBottom: r.empleados.length ? "1rem" : 0,
                }}
              >
                <div
                  className="card"
                    title="Efectivo en la ruta disponible para asignar a la caja del trabajador"
                  style={{
                    padding: "0.65rem 0.85rem",
                    margin: 0,
                    background: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      display: "block",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Caja de la ruta
                  </span>
                  <span style={{ fontSize: "1.05rem", fontWeight: 700 }}>{formatMonto(r.cajaRuta)}</span>
                </div>
              </div>
              {r.empleados.length === 0 ? (
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
                  Asigná un trabajador a esta ruta desde{" "}
                  <Link href="/dashboard/admin/empleado" style={{ color: "var(--accent, #c94a4a)" }}>
                    Empleado
                  </Link>{" "}
                  para poder entregarle base.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {r.empleados.map((emp) => {
                    const key = asignarKey(r.id, emp.uid);
                    const busy = asignandoKey === key;
                    return (
                      <div
                        key={emp.uid}
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "flex-end",
                          gap: "0.75rem",
                          padding: "0.75rem",
                          borderRadius: "8px",
                          background: "rgba(0,0,0,0.04)",
                        }}
                      >
                        <div style={{ flex: "1 1 160px", fontWeight: 600, fontSize: "0.9375rem" }}>
                          {emp.nombre}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
                            Monto
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ej: 150000"
                              value={montosAsignar[key] ?? ""}
                              disabled={busy}
                              onChange={(e) =>
                                setMontosAsignar((prev) => ({
                                  ...prev,
                                  [key]: formatMontoEnteroInput(e.target.value),
                                }))
                              }
                              style={{ minWidth: "120px" }}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy || r.cajaRuta <= 0}
                            onClick={() => handleAsignarBase(r.id, emp.uid)}
                          >
                            {busy ? "Asignando…" : "Asignar a la caja del trabajador"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
