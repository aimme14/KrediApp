"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  solicitarEntregaReporteDia,
  getMiSolicitudEntregaReporte,
  type SolicitudEntregaReporteApi,
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
  const [entregando, setEntregando] = useState(false);
  const [modalEntregaAbierto, setModalEntregaAbierto] = useState(false);
  const [comentarioEntrega, setComentarioEntrega] = useState("");
  const [msgReporte, setMsgReporte] = useState<string | null>(null);
  const [errReporte, setErrReporte] = useState<string | null>(null);
  const [solicitudPendiente, setSolicitudPendiente] = useState<SolicitudEntregaReporteApi | null>(null);

  const cargarSolicitudReporte = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const { pendiente } = await getMiSolicitudEntregaReporte(token);
      setSolicitudPendiente(pendiente);
    } catch {
      /* silencioso */
    }
  }, [user]);

  useEffect(() => {
    void cargarSolicitudReporte();
    const id = setInterval(() => void cargarSolicitudReporte(), 45_000);
    return () => clearInterval(id);
  }, [cargarSolicitudReporte]);

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
      const r = await solicitarEntregaReporteDia(token, {
        comentario: comentarioEntrega.trim(),
      });
      setMsgReporte(r.mensaje || `Solicitud enviada (${formatMonto(r.montoAlSolicitar)}). Esperá la confirmación del administrador.`);
      cerrarModalEntrega();
      await cargarSolicitudReporte();
    } catch (e) {
      setErrReporte(e instanceof Error ? e.message : "No se pudo entregar");
    } finally {
      setEntregando(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;

  const btnTitle = solicitudPendiente
    ? "Ya tenés una solicitud de entrega pendiente de confirmación."
    : undefined;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Entrega de reporte</h2>

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={entregando || Boolean(solicitudPendiente)}
          title={btnTitle}
          onClick={() => {
            setModalEntregaAbierto(true);
            setErrReporte(null);
          }}
        >
          Solicitar entrega de reporte
        </button>
        {msgReporte && (
          <p style={{ marginTop: "0.5rem", color: "var(--success, #6bbf6b)", fontSize: "0.875rem" }}>{msgReporte}</p>
        )}
        {!modalEntregaAbierto && errReporte && (
          <p className="error-msg" style={{ marginTop: "0.5rem" }}>{errReporte}</p>
        )}
      </div>

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
              Solicitar entrega del reporte
            </h2>
            <p className="gf-modal-desc">
              Se enviará una solicitud a tu administrador. Cuando confirme que recibió el efectivo, todo el dinero de tu caja
              pasará a la caja de la ruta. Si no confirma, el dinero permanece en tu caja.
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
                {entregando ? "Enviando…" : "Enviar solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
