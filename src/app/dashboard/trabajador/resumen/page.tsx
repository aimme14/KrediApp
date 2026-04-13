"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listPrestamos,
  listGastos,
  entregarReporteDia,
  type PrestamoItem,
  type GastoItem,
} from "@/lib/empresa-api";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function ResumenDelDiaPage() {
  const { user, profile } = useAuth();
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [entregando, setEntregando] = useState(false);
  const [msgReporte, setMsgReporte] = useState<string | null>(null);
  const [errReporte, setErrReporte] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const token = user.getIdToken().then((t) => t);
    Promise.all([token.then((t) => listPrestamos(t)), token.then((t) => listGastos(t))])
      .then(([p, g]) => {
        setPrestamos(p);
        setGastos(g);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const hoy = new Date().toDateString();
  const recogidoHoy = prestamos.reduce((sum, p) => sum + (p.totalAPagar - p.saldoPendiente), 0);
  const faltaRecoger = prestamos.reduce((sum, p) => sum + p.saldoPendiente, 0);
  const gastosHoy = gastos
    .filter((g) => g.fecha && new Date(g.fecha).toDateString() === hoy)
    .reduce((sum, g) => sum + g.monto, 0);
  const gastosTotal = gastos.reduce((sum, g) => sum + g.monto, 0);

  const handleEntregarReporte = async () => {
    if (!user) return;
    setErrReporte(null);
    setMsgReporte(null);
    setEntregando(true);
    try {
      const token = await user.getIdToken();
      const r = await entregarReporteDia(token);
      setMsgReporte(`Entregaste ${formatMonto(r.monto)} a la base de la ruta.`);
    } catch (e) {
      setErrReporte(e instanceof Error ? e.message : "No se pudo entregar");
    } finally {
      setEntregando(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Resumen del día</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Los cobros de capital quedan en tu base; los intereses se registran en ganancias de la ruta. Cuando entregues el efectivo al administrador,
        usá &quot;Entregar reporte&quot; para pasar tu base a la base de la ruta.
      </p>

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={entregando}
          onClick={handleEntregarReporte}
        >
          {entregando ? "Entregando…" : "Entregar reporte"}
        </button>
        {msgReporte && (
          <p style={{ marginTop: "0.5rem", color: "var(--success, #6bbf6b)", fontSize: "0.875rem" }}>{msgReporte}</p>
        )}
        {errReporte && <p className="error-msg" style={{ marginTop: "0.5rem" }}>{errReporte}</p>}
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Lo recogido, lo que falta por recoger y los gastos generados.
      </p>

      {loading ? (
        <p>Cargando...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="col-num">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Lo recogido (cobrado a clientes)</td>
                <td className="col-num">{recogidoHoy.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Lo que falta por recoger (saldo pendiente)</td>
                <td className="col-num">{faltaRecoger.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Gastos generados (hoy)</td>
                <td className="col-num">{gastosHoy.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Gastos totales (historial)</td>
                <td className="col-num">{gastosTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
