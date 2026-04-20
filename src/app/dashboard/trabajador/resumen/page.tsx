"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import {
  listGastos,
  entregarReporteDia,
  type GastoItem,
} from "@/lib/empresa-api";

const MAX_COMENTARIO_REPORTE = 2000;

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function ResumenDelDiaPage() {
  const { user, profile } = useAuth();
  const { prestamos, loading: loadingLista } = useTrabajadorLista();
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [loadingGastos, setLoadingGastos] = useState(true);
  const [entregando, setEntregando] = useState(false);
  const [modalEntregaAbierto, setModalEntregaAbierto] = useState(false);
  const [comentarioEntrega, setComentarioEntrega] = useState("");
  const [msgReporte, setMsgReporte] = useState<string | null>(null);
  const [errReporte, setErrReporte] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingGastos(true);
    user
      .getIdToken()
      .then((t) => listGastos(t))
      .then((g) => {
        if (!cancelled) setGastos(g);
      })
      .finally(() => {
        if (!cancelled) setLoadingGastos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!modalEntregaAbierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalEntregaAbierto(false);
        setComentarioEntrega("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalEntregaAbierto]);

  const loading = loadingLista || loadingGastos;

  const hoy = new Date().toDateString();
  const recogidoHoy = prestamos.reduce((sum, p) => sum + (p.totalAPagar - p.saldoPendiente), 0);
  const faltaRecoger = prestamos.reduce((sum, p) => sum + p.saldoPendiente, 0);
  const gastosHoy = gastos
    .filter((g) => g.fecha && new Date(g.fecha).toDateString() === hoy)
    .reduce((sum, g) => sum + g.monto, 0);
  const gastosTotal = gastos.reduce((sum, g) => sum + g.monto, 0);

  const cerrarModalEntrega = () => {
    setModalEntregaAbierto(false);
    setComentarioEntrega("");
    setErrReporte(null);
  };

  const handleConfirmarEntrega = async () => {
    if (!user) return;
    if (comentarioEntrega.length > MAX_COMENTARIO_REPORTE) {
      setErrReporte(`El comentario no puede superar ${MAX_COMENTARIO_REPORTE} caracteres`);
      return;
    }
    setErrReporte(null);
    setMsgReporte(null);
    setEntregando(true);
    try {
      const token = await user.getIdToken();
      const r = await entregarReporteDia(token, {
        comentario: comentarioEntrega.trim(),
      });
      setMsgReporte(`Entregaste ${formatMonto(r.monto)} a la base de la ruta.`);
      cerrarModalEntrega();
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
          onClick={() => {
            setModalEntregaAbierto(true);
            setErrReporte(null);
          }}
        >
          Entregar reporte
        </button>
        {msgReporte && (
          <p style={{ marginTop: "0.5rem", color: "var(--success, #6bbf6b)", fontSize: "0.875rem" }}>{msgReporte}</p>
        )}
        {!modalEntregaAbierto && errReporte && (
          <p className="error-msg" style={{ marginTop: "0.5rem" }}>{errReporte}</p>
        )}
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

      {modalEntregaAbierto && (
        <div className="gf-modal-backdrop" onClick={cerrarModalEntrega} aria-hidden>
          <div
            className="gf-modal"
            style={{ maxWidth: "440px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resumen-entrega-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="resumen-entrega-title" className="gf-modal-title">
              Confirmar entrega del reporte
            </h2>
            <p className="gf-modal-desc">
              Vas a pasar todo el efectivo de tu base (o jornada abierta) a la base de la ruta. ¿Confirmás la entrega?
            </p>
            <label htmlFor="resumen-entrega-comentario" className="gf-modal-label">
              Comentario <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opcional)</span>
            </label>
            <textarea
              id="resumen-entrega-comentario"
              className="gf-modal-input"
              style={{ minHeight: "88px", resize: "vertical" }}
              value={comentarioEntrega}
              onChange={(e) => setComentarioEntrega(e.target.value.slice(0, MAX_COMENTARIO_REPORTE))}
              placeholder="Ej. billetes revisados, novedades del día…"
              disabled={entregando}
              maxLength={MAX_COMENTARIO_REPORTE}
              rows={4}
            />
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {comentarioEntrega.length}/{MAX_COMENTARIO_REPORTE}
            </p>
            {errReporte && (
              <p className="error-msg" style={{ marginTop: "0.5rem", marginBottom: 0 }} role="alert">
                {errReporte}
              </p>
            )}
            <div className="gf-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cerrarModalEntrega}
                disabled={entregando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleConfirmarEntrega()}
                disabled={entregando}
              >
                {entregando ? "Entregando…" : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
