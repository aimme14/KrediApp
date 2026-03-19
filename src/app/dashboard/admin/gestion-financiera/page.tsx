"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getCajaAdmin, getResumenEconomico, type ResumenRutaItem } from "@/lib/empresa-api";

function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function GestionFinancieraPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cajaAdmin, setCajaAdmin] = useState(0);
  const [rutas, setRutas] = useState<ResumenRutaItem[]>([]);

  const load = useCallback(async () => {
    if (!user || !profile || profile.role !== "admin") return;

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [caja, resumen] = await Promise.all([getCajaAdmin(token), getResumenEconomico(token)]);
      setCajaAdmin(caja);
      setRutas(resumen.rutas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar gestión financiera");
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const baseRutas = useMemo(() => rutas.reduce((sum, r) => sum + (r.cajaRuta ?? 0), 0), [rutas]);
  const totalGastos = useMemo(() => rutas.reduce((sum, r) => sum + (r.gastos ?? 0), 0), [rutas]);
  const cobertura = useMemo(() => cajaAdmin - totalGastos, [cajaAdmin, totalGastos]);

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Gestión financiera</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Caja del administrador, base (suma de caja ruta) y sumatoria de gastos por ruta.
      </p>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando gestión...</p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px" }}>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Caja admin</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>
                {formatMoneda(cajaAdmin)}
              </div>
            </div>

            <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px" }}>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Base (suma caja ruta)</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>
                {formatMoneda(baseRutas)}
              </div>
            </div>

            <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px" }}>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Total gastos (sumatoria)</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>
                {formatMoneda(totalGastos)}
              </div>
            </div>

            <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px" }}>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Cobertura (caja admin - gastos)</div>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: cobertura >= 0 ? "var(--text)" : "#dc2626",
                  marginTop: "0.25rem",
                }}
              >
                {formatMoneda(cobertura)}
              </div>
            </div>
          </div>

          {rutas.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No hay rutas registradas.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ruta</th>
                    <th className="col-num">Caja ruta (base)</th>
                    <th className="col-num">Gastos (por ruta)</th>
                  </tr>
                </thead>
                <tbody>
                  {rutas.map((r) => (
                    <tr key={r.rutaId}>
                      <td>{r.nombre}</td>
                      <td className="col-num">{formatMoneda(r.cajaRuta ?? 0)}</td>
                      <td className="col-num">{formatMoneda(r.gastos ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

