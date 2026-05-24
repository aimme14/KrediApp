"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { formatInteresResumenPct } from "@/lib/interes-pct";
import {
  getSolicitudesPrestamoPendientes,
  aprobarSolicitudPrestamo,
  rechazarSolicitudPrestamo,
  type SolicitudPrestamoApi,
} from "@/lib/empresa-api";

function formatMoneda(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "—";
  const [entero, dec = ""] = n.toFixed(2).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decTrim = dec.replace(/0+$/, "");
  return decTrim ? `${conPuntos},${decTrim}` : conPuntos;
}

const MODALIDAD_LABEL: Record<string, string> = {
  diario: "Diario",
  semanal: "Semanal",
  mensual: "Mensual",
};

export default function SolicitudesPrestamoAdminPage() {
  const { user, profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState<SolicitudPrestamoApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionId, setAccionId] = useState<string | null>(null);
  const [rechazarId, setRechazarId] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");

  const cargar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const items = await getSolicitudesPrestamoPendientes(token);
      setSolicitudes(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar solicitudes");
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const handleAprobar = async (solicitudId: string) => {
    if (!user) return;
    setAccionId(solicitudId);
    setError(null);
    try {
      const token = await user.getIdToken();
      await aprobarSolicitudPrestamo(token, solicitudId);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aprobar");
    } finally {
      setAccionId(null);
    }
  };

  const handleRechazar = async () => {
    if (!user || !rechazarId) return;
    setAccionId(rechazarId);
    setError(null);
    try {
      const token = await user.getIdToken();
      await rechazarSolicitudPrestamo(token, rechazarId, {
        motivo: motivoRechazo.trim() || undefined,
      });
      setRechazarId(null);
      setMotivoRechazo("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al rechazar");
    } finally {
      setAccionId(null);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Solicitudes de préstamo</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Los trabajadores envían solicitudes que debes aprobar o rechazar antes de que se cree el
        préstamo.
      </p>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No hay solicitudes pendientes.</p>
      ) : (
        <div className="table-wrap">
          <table className="table-historial">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Cliente</th>
                <th className="col-num">Monto</th>
                <th className="col-num">Interés</th>
                <th>Cuotas</th>
                <th>Modalidad</th>
                <th>Solicitada</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map((s) => {
                const totalAPagar = Math.round(s.monto * (1 + s.interes / 100) * 100) / 100;
                const cuota =
                  s.numeroCuotas > 0 ? Math.round((totalAPagar / s.numeroCuotas) * 100) / 100 : 0;
                const fecha =
                  s.creadaEn &&
                  new Date(s.creadaEn).toLocaleString("es-CO", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                return (
                  <tr key={s.id}>
                    <td>{s.empleadoNombre || "—"}</td>
                    <td>{s.clienteNombre || "—"}</td>
                    <td className="col-num">{formatMoneda(s.monto)}</td>
                    <td className="col-num">{formatInteresResumenPct(s.interes)}%</td>
                    <td>
                      {s.numeroCuotas} ({formatMoneda(cuota)}/cuota)
                    </td>
                    <td>{MODALIDAD_LABEL[s.modalidad] ?? s.modalidad}</td>
                    <td>{fecha || "—"}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={accionId === s.id}
                          onClick={() => void handleAprobar(s.id)}
                        >
                          {accionId === s.id ? "…" : "Aprobar"}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={accionId === s.id}
                          onClick={() => {
                            setRechazarId(s.id);
                            setMotivoRechazo("");
                          }}
                        >
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rechazarId && (
        <div
          className="card"
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            border: "1px solid var(--border)",
          }}
          role="dialog"
          aria-label="Rechazar solicitud"
        >
          <h3 style={{ marginTop: 0 }}>Rechazar solicitud</h3>
          <div className="form-group">
            <label htmlFor="motivo-rechazo-prestamo">Motivo (opcional)</label>
            <textarea
              id="motivo-rechazo-prestamo"
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={3}
              maxLength={500}
              style={{ width: "100%", resize: "vertical" }}
              placeholder="Indica por qué rechazas la solicitud…"
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={accionId === rechazarId}
              onClick={() => void handleRechazar()}
            >
              {accionId === rechazarId ? "Rechazando…" : "Confirmar rechazo"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={accionId === rechazarId}
              onClick={() => {
                setRechazarId(null);
                setMotivoRechazo("");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
