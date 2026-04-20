"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { getReportesDia, type ReporteDiaItem } from "@/lib/empresa-api";

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

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await getReportesDia(token, fecha);
      setItems(res.items);
      setTotalMonto(res.totalMonto);
      setFechaDia(res.fechaDia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
      setTotalMonto(0);
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
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Entregas de efectivo que los trabajadores pasan desde su base a la base de la ruta (botón &quot;Entregar reporte&quot; en su resumen).
        Los cobros de capital quedan primero en la base del trabajador; al entregar el reporte, ese efectivo vuelve a la base de la ruta. Los intereses
        ya se registran en ganancias de la ruta al momento del cobro.
      </p>

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
        <p style={{ color: "var(--text-muted)" }}>No hay entregas registradas para el {fechaDia || fecha}.</p>
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
