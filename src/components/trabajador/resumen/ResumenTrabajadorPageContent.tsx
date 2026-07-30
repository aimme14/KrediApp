"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, type DocumentData } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import { formatFechaDia } from "@/lib/colombia-day-bounds";
import {
  solicitarEntregaReporteDia,
  type SolicitudEntregaReporteApi,
} from "@/lib/empresa-api";
import { resolverEstadoSolicitudesEmpleado } from "@/lib/resolver-estado-solicitudes-empleado";
import { guardOfflineWrite, useOnline } from "@/hooks/useOnline";

const MAX_COMENTARIO_REPORTE = 2000;

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function mapDocToSolicitud(id: string, d: DocumentData): SolicitudEntregaReporteApi {
  return {
    id,
    empleadoUid: d.empleadoUid ?? "",
    empleadoNombre: d.empleadoNombre ?? "",
    rutaId: d.rutaId ?? "",
    rutaNombre: d.rutaNombre ?? "",
    adminId: d.adminId ?? "",
    estado: d.estado ?? "",
    comentarioTrabajador: d.comentarioTrabajador ?? null,
    montoAlSolicitar: typeof d.montoAlSolicitar === "number" ? d.montoAlSolicitar : 0,
    creadaEn: d.creadaEn?.toDate?.()?.toISOString?.() ?? null,
    resueltaEn: d.resueltaEn?.toDate?.()?.toISOString?.() ?? null,
    resueltaPorUid: d.resueltaPorUid ?? null,
    motivoRechazo: d.motivoRechazo ?? null,
    montoEntregadoEfectivo: d.montoEntregadoEfectivo ?? null,
  };
}

type EstadoUiSolicitud = "en_curso" | "rechazada" | "aprobada" | "sin_solicitud";

export default function ResumenTrabajadorPageContent() {
  const { user, profile } = useAuth();
  const online = useOnline();
  const { data: cajaDia, tuCajaActual } = useTrabajadorCajaDia();
  const [entregando, setEntregando] = useState(false);
  const [modalEntregaAbierto, setModalEntregaAbierto] = useState(false);
  const [comentarioEntrega, setComentarioEntrega] = useState("");
  const [msgReporte, setMsgReporte] = useState<string | null>(null);
  const [errReporte, setErrReporte] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudEntregaReporteApi[]>([]);

  useEffect(() => {
    if (!db || !user || !profile?.empresaId) return;
    const empresaId = profile.empresaId.trim();

    const q = query(
      collection(db, "empresas", empresaId, "solicitudesEntregaReporte"),
      where("empleadoUid", "==", user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setSolicitudes(snap.docs.map((docSnap) => mapDocToSolicitud(docSnap.id, docSnap.data())));
      },
      (err) => console.warn("[ResumenTrabajador] onSnapshot solicitudes:", err)
    );

    return unsub;
  }, [user?.uid, profile?.empresaId]);

  const paraResolver = solicitudes.map((s) => ({
    ...s,
    estado: (s.estado === "aprobada" || s.estado === "rechazada" || s.estado === "pendiente"
      ? s.estado
      : "pendiente") as "pendiente" | "aprobada" | "rechazada",
    creadaEn: s.creadaEn ? new Date(s.creadaEn) : null,
  }));
  const { pendiente, ultimaRechazada, masReciente } =
    resolverEstadoSolicitudesEmpleado(paraResolver);

  let estadoSolicitud: EstadoUiSolicitud = "sin_solicitud";
  if (pendiente) estadoSolicitud = "en_curso";
  else if (ultimaRechazada) estadoSolicitud = "rechazada";
  else if (masReciente?.estado === "aprobada") estadoSolicitud = "aprobada";

  const solicitudRechazada = ultimaRechazada
    ? solicitudes.find((s) => s.id === ultimaRechazada.id) ?? null
    : null;
  const solicitudMasReciente = masReciente
    ? solicitudes.find((s) => s.id === masReciente.id) ?? null
    : null;

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
    setErrReporte(null);
  };

  const handleConfirmarEntrega = async () => {
    if (!guardOfflineWrite(online, setErrReporte)) return;
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
    } catch (e) {
      setErrReporte(e instanceof Error ? e.message : "No se pudo entregar");
    } finally {
      setEntregando(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;

  const btnTitle =
    estadoSolicitud === "en_curso"
      ? "Ya tenés una solicitud de entrega pendiente de confirmación."
      : undefined;

  const ctaLabel = estadoSolicitud === "rechazada" ? "Corregir y reenviar" : "Solicitar entrega de reporte";

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Entrega de reporte</h2>

      {estadoSolicitud !== "sin_solicitud" && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            borderRadius: "10px",
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>Estado de solicitud</p>
          {estadoSolicitud === "en_curso" ? (
            <>
              <p style={{ margin: "0.35rem 0 0", fontWeight: 700, color: "var(--warning, #f4c430)" }}>
                En curso
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Tu solicitud está pendiente de validación por el administrador.
              </p>
            </>
          ) : estadoSolicitud === "aprobada" ? (
            <>
              <p style={{ margin: "0.35rem 0 0", fontWeight: 700, color: "var(--success, #6bbf6b)" }}>
                Aprobada
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Tu última solicitud fue aprobada
                {solicitudMasReciente && typeof solicitudMasReciente.montoEntregadoEfectivo === "number"
                  ? ` (${formatMonto(solicitudMasReciente.montoEntregadoEfectivo)}).`
                  : "."}
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: "0.35rem 0 0", fontWeight: 700, color: "var(--danger, #d9534f)" }}>
                Rechazada
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                {solicitudRechazada?.motivoRechazo?.trim()
                  ? `Motivo: ${solicitudRechazada.motivoRechazo}`
                  : "Motivo: sin detalle del administrador."}
              </p>
            </>
          )}
        </div>
      )}

      {cajaDia && (
        <div
          style={{
            marginBottom: "1.25rem",
            padding: "1rem",
            borderRadius: "12px",
            border: "1px solid var(--card-border)",
            background: "var(--input-bg)",
          }}
        >
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Resumen del día — {formatFechaDia(cajaDia.fechaDia)}
          </p>
          {[
            { label: "Base asignada", valor: cajaDia.totalBaseAsignadaDia },
            { label: "Cobrado en efectivo", valor: cajaDia.totalCobrosEfectivoDia },
            {
              label: "Cobrado por transferencia",
              valor: cajaDia.totalCobrosLista - cajaDia.totalCobrosEfectivoDia,
            },
            { label: "Gastos del día", valor: -cajaDia.totalGastosDia },
            { label: "Préstamos desembolsados", valor: -(cajaDia.totalPrestamosDesembolsoDia ?? 0) },
          ].map(({ label, valor }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.35rem 0",
                borderBottom: "1px solid var(--card-border)",
                fontSize: "0.875rem",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>{label}</span>
              <span
                style={{
                  fontWeight: 600,
                  color: valor < 0 ? "var(--danger, #f87171)" : "var(--text)",
                }}
              >
                {valor < 0 ? `- ${formatMonto(Math.abs(valor))}` : formatMonto(valor)}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "0.65rem",
              marginTop: "0.25rem",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Tu caja actual</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)" }}>
              {formatMonto(tuCajaActual ?? 0)}
            </span>
          </div>
        </div>
      )}

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={entregando || estadoSolicitud === "en_curso" || !online}
          title={btnTitle}
          onClick={() => {
            setModalEntregaAbierto(true);
            setComentarioEntrega(
              estadoSolicitud === "rechazada" ? solicitudRechazada?.comentarioTrabajador ?? "" : ""
            );
            setMsgReporte(null);
            setErrReporte(null);
          }}
        >
          {ctaLabel}
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
                disabled={entregando || !online}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleConfirmarEntrega()}
                disabled={entregando || !online}
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
