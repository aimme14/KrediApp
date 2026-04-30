"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  getCobrosDelDiaEmpleado,
  type CobrosDelDiaEmpleadoResponse,
  type CobroDiaItem,
  type NoPagoDiaItem,
} from "@/lib/empresa-api";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatHora(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Mismas etiquetas que en cobrar → «No pagó». */
const MOTIVO_NO_PAGO_LABEL: Record<string, string> = {
  sin_fondos: "No tenía dinero",
  no_estaba: "No estaba en casa",
  promesa_pago: "Prometió pagar después",
  otro: "Otro motivo",
};

function labelMotivoNoPago(codigo: string): string {
  return MOTIVO_NO_PAGO_LABEL[codigo] ?? codigo;
}

export default function CajaDelDiaPage() {
  const { user, profile } = useAuth();
  const [fecha, setFecha] = useState(() => fechaDiaColombiaHoy());
  const [data, setData] = useState<CobrosDelDiaEmpleadoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await getCobrosDelDiaEmpleado(token, fecha);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, fecha]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profile || profile.role !== "trabajador") return null;

  const esHoy = fecha === fechaDiaColombiaHoy();

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem 1rem",
          marginBottom: "1rem",
          marginTop: 0,
          width: "100%",
        }}
      >
        <h2 style={{ margin: 0, lineHeight: 1.25, flex: "1 1 auto", minWidth: 0 }}>
          Caja del día
        </h2>
        <input
          className="caja-del-dia-fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          disabled={loading}
          aria-label="Fecha (Colombia)"
          style={{
            maxWidth: "11rem",
            flexShrink: 0,
            padding: "0.4rem 0.55rem",
            borderRadius: "8px",
            border: "1px solid var(--input-border)",
            background: "var(--input-bg)",
            color: "var(--text)",
          }}
        />
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading && !data ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
      ) : data ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "0.65rem",
              marginBottom: "1.25rem",
            }}
          >
            <div
              className="card"
              style={{
                padding: "0.65rem 0.85rem",
                margin: 0,
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
                Caja (efectivo)
              </span>
              <span style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                {formatMonto(data.cajaEmpleado)}
              </span>
            </div>
            <div
              className="card"
              style={{
                padding: "0.65rem 0.85rem",
                margin: 0,
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
                Total cobrado ({data.fechaDia})
              </span>
              <span style={{ fontSize: "1.05rem", fontWeight: 700 }}>{formatMonto(data.totalCobrosLista)}</span>
            </div>
            <div
              className="card"
              style={{
                padding: "0.65rem 0.85rem",
                margin: 0,
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
                Gastos del día
              </span>
              <span style={{ fontSize: "1.05rem", fontWeight: 700 }}>{formatMonto(data.totalGastosDia)}</span>
            </div>
          </div>

          {esHoy && (
            <p
              style={{
                marginBottom: "1.25rem",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              Si colocaste préstamos desde tu caja o entregaste reporte, «Caja (efectivo)» puede no coincidir con tu
              efectivo real. Si cambiás de fecha, cobros y gastos son históricos y «Caja (efectivo)» sigue siendo tu
              saldo vigente actual.
            </p>
          )}

          <h3 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>Cuotas pagadas</h3>
          {data.cobros.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No hay cobros registrados para esta fecha.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th className="col-num">Pagado</th>
                    <th>Método</th>
                    <th className="col-num">Saldo préstamo tras cobro</th>
                    <th className="col-num">Saldo actual préstamo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cobros.map((c: CobroDiaItem) => (
                    <tr key={`${c.prestamoId}-${c.pagoId}`}>
                      <td>{formatHora(c.fecha)}</td>
                      <td>{c.clienteNombre}</td>
                      <td className="col-num">{formatMonto(c.monto)}</td>
                      <td>{c.metodoPago ?? "—"}</td>
                      <td className="col-num">{formatMonto(c.saldoPendienteTrasPago)}</td>
                      <td className="col-num">{formatMonto(c.saldoPendientePrestamoActual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3
            style={{
              fontSize: "1.05rem",
              marginTop: "1.25rem",
              marginBottom: "0.5rem",
            }}
          >
            Clientes que no pagaron
          </h3>
          <p
            style={{
              marginBottom: "0.5rem",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              lineHeight: 1.45,
            }}
          >
            Visitas donde registraste «No pagó» en Cobrar (misma fecha y tu usuario).
          </p>
          {(data.noPagos ?? []).length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>
              No hay registros de no pago para esta fecha.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Motivo</th>
                    <th>Nota</th>
                    <th className="col-num">Saldo préstamo (actual)</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.noPagos ?? []).map((n: NoPagoDiaItem) => (
                    <tr key={`no-${n.prestamoId}-${n.pagoId}`}>
                      <td>{formatHora(n.fecha)}</td>
                      <td>{n.clienteNombre}</td>
                      <td>{labelMotivoNoPago(n.motivoNoPago)}</td>
                      <td>{n.nota ?? "—"}</td>
                      <td className="col-num">{formatMonto(n.saldoPendientePrestamoActual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.gastosDelDia.length > 0 && (
            <>
              <h3 style={{ fontSize: "1.05rem", marginTop: "1.25rem", marginBottom: "0.5rem" }}>Gastos del día</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Descripción</th>
                      <th className="col-num">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gastosDelDia.map((g) => (
                      <tr key={g.id}>
                        <td>{formatHora(g.fecha)}</td>
                        <td>{g.descripcion || "—"}</td>
                        <td className="col-num">{formatMonto(g.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : null}

      <p style={{ marginTop: "1.25rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
        Préstamo: columna técnica en detalle de cobro —{" "}
        <Link href="/dashboard/trabajador/cobrar" style={{ color: "var(--accent, #c94a4a)" }}>
          Ir a cobrar
        </Link>
        .
      </p>
    </div>
  );
}
