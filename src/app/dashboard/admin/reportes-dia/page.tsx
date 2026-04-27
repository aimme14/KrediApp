"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getReportesDia,
  getSolicitudesEntregaReportePendientes,
  aprobarSolicitudEntregaReporte,
  rechazarSolicitudEntregaReporte,
  type ReporteDiaItem,
  type SolicitudEntregaPendienteAdmin,
} from "@/lib/empresa-api";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function ReportesDiaPage() {
  const { user, profile } = useAuth();
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [items, setItems] = useState<ReporteDiaItem[]>([]);
  const [totalMonto, setTotalMonto] = useState(0);
  const [fechaDia, setFechaDia] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudEntregaPendienteAdmin[]>([]);
  const [accionId, setAccionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [res, pend] = await Promise.all([
        getReportesDia(token, fecha),
        getSolicitudesEntregaReportePendientes(token),
      ]);
      setItems(res.items);
      setTotalMonto(res.totalMonto);
      setFechaDia(res.fechaDia);
      setSolicitudes(pend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
      setTotalMonto(0);
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [user, fecha]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Reportes del día</h2>

      {solicitudes.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1.05rem" }}>
            Solicitudes pendientes de confirmación
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {solicitudes.map((s) => (
              <div
                key={s.id}
                className="card"
                style={{
                  padding: "1rem",
                  margin: 0,
                  border: "1px solid var(--card-border)",
                  background: "var(--card-bg)",
                }}
              >
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
                  <strong>{s.empleadoNombre}</strong> desea entregarte el reporte diario (efectivo de su caja hacia la caja de la ruta{" "}
                  {s.rutaNombre ? `«${s.rutaNombre}»` : s.rutaId}).
                </p>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  Monto al momento de la solicitud: <strong style={{ color: "var(--text)" }}>{formatMonto(s.montoAlSolicitar)}</strong>
                  {s.creadaEn
                    ? ` · ${new Date(s.creadaEn).toLocaleString("es-CO")}`
                    : ""}
                </p>
                {s.comentarioTrabajador ? (
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                    Comentario del trabajador: <em>{s.comentarioTrabajador}</em>
                  </p>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={accionId !== null}
                    onClick={async () => {
                      if (!user) return;
                      setAccionId(s.id);
                      setError(null);
                      try {
                        const token = await user.getIdToken();
                        await aprobarSolicitudEntregaReporte(token, s.id);
                        await load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error al aprobar");
                      } finally {
                        setAccionId(null);
                      }
                    }}
                  >
                    {accionId === s.id ? "Procesando…" : "Confirmar recepción (OK)"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={accionId !== null}
                    onClick={async () => {
                      if (!user) return;
                      const motivo =
                        typeof window !== "undefined"
                          ? window.prompt("Motivo del rechazo (opcional). El trabajador lo verá en su resumen.")?.trim() ?? ""
                          : "";
                      setAccionId(s.id);
                      setError(null);
                      try {
                        const token = await user.getIdToken();
                        await rechazarSolicitudEntregaReporte(token, s.id, {
                          motivo: motivo || undefined,
                        });
                        await load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error al rechazar");
                      } finally {
                        setAccionId(null);
                      }
                    }}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="form-group" style={{ maxWidth: "220px" }}>
        <label>Fecha</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No hay entregas confirmadas para el {fechaDia || fecha}.
          {solicitudes.length === 0 ? " Si un trabajador envió una solicitud, aparecerá arriba hasta que la confirmes." : ""}
        </p>
      ) : (
        <>
          <p style={{ marginBottom: "0.75rem", fontWeight: 600 }}>
            Total del día: {formatMonto(totalMonto)}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Ruta</th>
                  <th>Trabajador</th>
                  <th>Comentario</th>
                  <th className="col-num">Monto entregado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.fecha
                        ? new Date(row.fecha).toLocaleString("es-CO", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td>
                      {row.rutaNombre || row.rutaId}
                      {row.rutaNombre ? (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", display: "block" }}>
                          {row.rutaId}
                        </span>
                      ) : null}
                    </td>
                    <td>{row.empleadoNombre}</td>
                    <td
                      style={{
                        maxWidth: "280px",
                        fontSize: "0.875rem",
                        color: row.comentario ? "var(--text)" : "var(--text-muted)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {row.comentario ?? "—"}
                    </td>
                    <td className="col-num">{formatMonto(row.montoEntregado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
