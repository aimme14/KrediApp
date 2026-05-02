"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { useAuth } from "@/context/AuthContext";
import { formatoCuotasRestanteTotal } from "@/lib/cuotas-display";
import {
  getReportesDia,
  getSolicitudesEntregaReportePendientes,
  getPreviewEntregaReporteAdmin,
  getReporteDiaPdfUrl,
  regenerarReporteDiaPdf,
  aprobarSolicitudEntregaReporte,
  rechazarSolicitudEntregaReporte,
  type ReporteDiaItem,
  type SolicitudEntregaPendienteAdmin,
  type CobrosDelDiaEmpleadoResponse,
} from "@/lib/empresa-api";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

const REPORTES_DIA_ICON = 18;

function IconComentario({ size = REPORTES_DIA_ICON }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconDescargar({ size = REPORTES_DIA_ICON }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconReintentar({ size = REPORTES_DIA_ICON }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function totalesVistaPreviaReporte(s: CobrosDelDiaEmpleadoResponse) {
  const prestamos = s.prestamosDesembolsoDelDia ?? [];
  return {
    prestamosCapital: prestamos.reduce((a, p) => a + p.monto, 0),
    prestamosTotalAPagar: prestamos.reduce((a, p) => a + p.totalAPagar, 0),
    cobrosMonto: s.cobros.reduce((a, c) => a + c.monto, 0),
    cobrosTotalAPagar: s.cobros.reduce((a, c) => a + c.totalAPagar, 0),
    cobrosSaldoTras: s.cobros.reduce((a, c) => a + c.saldoPendienteTrasPago, 0),
    noPagoDebe: s.noPagos.reduce((a, n) => a + n.saldoPendientePrestamoActual, 0),
    noPagoTotalPrestamo: s.noPagos.reduce((a, n) => a + n.totalAPagar, 0),
    gastosMonto: s.gastosDelDia.reduce((a, g) => a + g.monto, 0),
  };
}

export default function ReportesDiaPage() {
  const { user, profile } = useAuth();
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [items, setItems] = useState<ReporteDiaItem[]>([]);
  const [fechaDia, setFechaDia] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudEntregaPendienteAdmin[]>([]);
  const [accionId, setAccionId] = useState<string | null>(null);
  const [previewSolicitudId, setPreviewSolicitudId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<CobrosDelDiaEmpleadoResponse | null>(
    null
  );
  const [previewMeta, setPreviewMeta] = useState<{
    fechaDiaPreview: string;
    empleadoNombre: string;
    rutaNombre: string;
    montoAlSolicitar: number;
    comentarioTrabajador: string | null;
  } | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [regenerarPdfId, setRegenerarPdfId] = useState<string | null>(null);
  const [regenerarPdfErr, setRegenerarPdfErr] = useState<string | null>(null);
  const [comentarioModal, setComentarioModal] = useState<{
    trabajador: string;
    ruta: string;
    texto: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setRegenerarPdfErr(null);
    try {
      const token = await user.getIdToken();
      const [res, pend] = await Promise.all([
        getReportesDia(token, fecha),
        getSolicitudesEntregaReportePendientes(token),
      ]);
      setItems(res.items);
      setFechaDia(res.fechaDia);
      setSolicitudes(pend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setItems([]);
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [user, fecha]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!previewSolicitudId || !user) {
      setPreviewSnapshot(null);
      setPreviewMeta(null);
      setPreviewErr(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewErr(null);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const data = await getPreviewEntregaReporteAdmin(token, previewSolicitudId);
        if (cancelled) return;
        setPreviewSnapshot(data.snapshot);
        setPreviewMeta({
          fechaDiaPreview: data.fechaDiaPreview,
          empleadoNombre: data.solicitud.empleadoNombre,
          rutaNombre: data.solicitud.rutaNombre,
          montoAlSolicitar: data.solicitud.montoAlSolicitar,
          comentarioTrabajador: data.solicitud.comentarioTrabajador,
        });
      } catch (e) {
        if (!cancelled) {
          setPreviewErr(e instanceof Error ? e.message : "Error al cargar vista previa");
          setPreviewSnapshot(null);
          setPreviewMeta(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewSolicitudId, user]);

  const abrirPdfReporte = async (reporteId: string) => {
    if (!user) return;
    setPdfLoadingId(reporteId);
    try {
      const token = await user.getIdToken();
      const { url } = await getReporteDiaPdfUrl(token, reporteId);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el PDF");
    } finally {
      setPdfLoadingId(null);
    }
  };

  const reintentarPdfReporte = async (reporteId: string) => {
    if (!user) return;
    setRegenerarPdfId(reporteId);
    setRegenerarPdfErr(null);
    try {
      const token = await user.getIdToken();
      await regenerarReporteDiaPdf(token, reporteId);
      await load();
    } catch (e) {
      setRegenerarPdfErr(e instanceof Error ? e.message : "Error al regenerar el PDF");
    } finally {
      setRegenerarPdfId(null);
    }
  };

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
                  <strong>{s.empleadoNombre}</strong> desea entregarte el reporte diario.
                </p>
                {s.comentarioTrabajador ? (
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                    Comentario del trabajador: <em>{s.comentarioTrabajador}</em>
                  </p>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={accionId !== null}
                    onClick={() => {
                      setPreviewSolicitudId(s.id);
                    }}
                  >
                    Previsualizar cierre del día
                  </button>
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

      {previewSolicitudId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setPreviewSolicitudId(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: "900px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <h3 style={{ marginTop: 0 }}>Vista previa del cierre (lo que se incluirá en el PDF)</h3>
              <button type="button" className="btn btn-secondary" onClick={() => setPreviewSolicitudId(null)}>
                Cerrar
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 0 }}>
              <strong>{previewMeta?.fechaDiaPreview ?? "—"}</strong>
              {previewMeta ? (
                <>
                  {" "}
                  · {previewMeta.empleadoNombre} · {previewMeta.rutaNombre || "—"}
                </>
              ) : null}
            </p>
            {previewMeta?.comentarioTrabajador ? (
              <p style={{ fontSize: "0.9rem" }}>
                Comentario: <em>{previewMeta.comentarioTrabajador}</em>
              </p>
            ) : null}
            {previewLoading && <p>Cargando vista previa…</p>}
            {previewErr && <p className="error-msg">{previewErr}</p>}
            {previewSnapshot && !previewLoading && (() => {
              const t = totalesVistaPreviaReporte(previewSnapshot);
              const footCellStyle: CSSProperties = {
                borderTop: "1px solid var(--card-border)",
                fontWeight: 600,
              };
              return (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <strong>Resumen</strong>
                  <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                    <li>Total cobros del día: {formatMonto(previewSnapshot.totalCobrosLista)}</li>
                    <li>Base asignada hoy: {formatMonto(previewSnapshot.totalBaseAsignadaDia)}</li>
                    <li>Gastos del día: {formatMonto(previewSnapshot.totalGastosDia)}</li>
                    <li>
                      Préstamos desde tu caja:{" "}
                      {formatMonto(previewSnapshot.totalPrestamosDesembolsoDia ?? 0)}
                    </li>
                    <li>
                      <strong>Tu caja del día: {formatMonto(previewSnapshot.tuCajaDelDia)}</strong>
                    </li>
                    <li>Clientes que pagaron: {previewSnapshot.cobros.length}</li>
                    <li>Clientes que no pagaron: {previewSnapshot.noPagos.length}</li>
                  </ul>
                </div>
                <div className="table-wrap">
                  <strong>Préstamos otorgados desde tu caja</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th className="col-num">Capital</th>
                        <th className="col-num">Total a pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewSnapshot.prestamosDesembolsoDelDia ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ color: "var(--text-muted)" }}>
                            —
                          </td>
                        </tr>
                      ) : (
                        (previewSnapshot.prestamosDesembolsoDelDia ?? []).map((p) => (
                          <tr key={p.prestamoId}>
                            <td>{p.clienteNombre}</td>
                            <td className="col-num">{formatMonto(p.monto)}</td>
                            <td className="col-num">{formatMonto(p.totalAPagar)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={footCellStyle}>Total</td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.prestamosCapital)}
                        </td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.prestamosTotalAPagar)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="table-wrap">
                  <strong>Cobros del día</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th className="col-num">Monto</th>
                        <th>Método</th>
                        <th className="col-num">Total préstamo</th>
                        <th className="col-num">Debe tras cobro</th>
                        <th className="col-num">Cuotas (rest./total)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewSnapshot.cobros.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                            Sin cobros este día
                          </td>
                        </tr>
                      ) : (
                        previewSnapshot.cobros.slice(0, 80).map((c) => (
                          <tr key={c.pagoId}>
                            <td>{c.clienteNombre}</td>
                            <td className="col-num">{formatMonto(c.monto)}</td>
                            <td>{c.metodoPago ?? "—"}</td>
                            <td className="col-num">{formatMonto(c.totalAPagar)}</td>
                            <td className="col-num">{formatMonto(c.saldoPendienteTrasPago)}</td>
                            <td className="col-num">
                              {formatoCuotasRestanteTotal(c.cuotasFaltantes, c.numeroCuotas)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={footCellStyle}>Total</td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.cobrosMonto)}
                        </td>
                        <td style={footCellStyle} />
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.cobrosTotalAPagar)}
                        </td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.cobrosSaldoTras)}
                        </td>
                        <td className="col-num" style={footCellStyle} />
                      </tr>
                    </tfoot>
                  </table>
                  {previewSnapshot.cobros.length > 80 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Mostrando 80 de {previewSnapshot.cobros.length} (el PDF incluye hasta el límite configurado).
                    </p>
                  ) : null}
                </div>
                <div className="table-wrap">
                  <strong>No pagó</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Motivo</th>
                        <th>Nota</th>
                        <th className="col-num">Cuotas (pend./total)</th>
                        <th className="col-num">Total debe</th>
                        <th className="col-num">Total préstamo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewSnapshot.noPagos.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                            —
                          </td>
                        </tr>
                      ) : (
                        previewSnapshot.noPagos.map((n) => (
                          <tr key={n.pagoId}>
                            <td>{n.clienteNombre}</td>
                            <td>{n.motivoNoPago}</td>
                            <td>{n.nota ?? "—"}</td>
                            <td className="col-num">
                              {formatoCuotasRestanteTotal(n.cuotasPendientes, n.numeroCuotas)}
                            </td>
                            <td className="col-num">{formatMonto(n.saldoPendientePrestamoActual)}</td>
                            <td className="col-num">{formatMonto(n.totalAPagar)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={footCellStyle}>Total</td>
                        <td style={footCellStyle} />
                        <td style={footCellStyle} />
                        <td className="col-num" style={footCellStyle} />
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.noPagoDebe)}
                        </td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.noPagoTotalPrestamo)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="table-wrap">
                  <strong>Gastos</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Motivo</th>
                        <th>Descripción</th>
                        <th className="col-num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewSnapshot.gastosDelDia.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ color: "var(--text-muted)" }}>
                            —
                          </td>
                        </tr>
                      ) : (
                        previewSnapshot.gastosDelDia.map((g) => (
                          <tr key={g.id}>
                            <td>{g.motivo || "—"}</td>
                            <td>{g.descripcion || "—"}</td>
                            <td className="col-num">{formatMonto(g.monto)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={footCellStyle}>Total</td>
                        <td style={footCellStyle} />
                        <td className="col-num" style={footCellStyle}>
                          {formatMonto(t.gastosMonto)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              );
            })()}
          </div>
        </div>
      )}

      {loading ? (
        <p>Cargando...</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          No hay entregas confirmadas para el {fechaDia || fecha}.
          {solicitudes.length === 0 ? " Si un trabajador envió una solicitud, aparecerá arriba hasta que la confirmes." : ""}
        </p>
      ) : (
        <>
          {regenerarPdfErr ? (
            <p className="error-msg" style={{ marginBottom: "0.75rem" }}>
              {regenerarPdfErr}
            </p>
          ) : null}
          {comentarioModal && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="comentario-modal-title"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem",
              }}
              onClick={() => setComentarioModal(null)}
            >
              <div
                className="card"
                style={{ maxWidth: "480px", width: "100%", margin: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  <h3 id="comentario-modal-title" style={{ marginTop: 0 }}>
                    Comentario
                  </h3>
                  <button type="button" className="btn btn-secondary" onClick={() => setComentarioModal(null)}>
                    Cerrar
                  </button>
                </div>
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  {comentarioModal.trabajador} · {comentarioModal.ruta}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.95rem",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: comentarioModal.texto ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {comentarioModal.texto?.trim() ? comentarioModal.texto : "Sin comentario."}
                </p>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Ruta</th>
                  <th>Trabajador</th>
                  <th>Comentario</th>
                  <th>PDF</th>
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
                    <td>{row.rutaNombre || "—"}</td>
                    <td>{row.empleadoNombre}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        aria-label="Ver comentario"
                        title="Ver comentario"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "2.25rem",
                          height: "2.25rem",
                          padding: 0,
                        }}
                        onClick={() =>
                          setComentarioModal({
                            trabajador: row.empleadoNombre,
                            ruta: row.rutaNombre || row.rutaId,
                            texto: row.comentario ?? null,
                          })
                        }
                      >
                        <IconComentario />
                      </button>
                    </td>
                    <td>
                      {row.tienePdf ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label={
                            pdfLoadingId === row.id ? "Abriendo PDF…" : "Descargar PDF"
                          }
                          title={pdfLoadingId === row.id ? "Abriendo…" : "Descargar PDF"}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "2.25rem",
                            height: "2.25rem",
                            padding: 0,
                          }}
                          disabled={pdfLoadingId === row.id}
                          onClick={() => void abrirPdfReporte(row.id)}
                        >
                          {pdfLoadingId === row.id ? (
                            <span
                              style={{
                                display: "inline-block",
                                width: "1rem",
                                height: "1rem",
                                border: "2px solid var(--text-muted)",
                                borderTopColor: "currentColor",
                                borderRadius: "50%",
                                animation: "gf-spin 0.8s linear infinite",
                              }}
                              aria-hidden
                            />
                          ) : (
                            <IconDescargar />
                          )}
                        </button>
                      ) : row.pdfError ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: "0.35rem",
                          }}
                        >
                          <span
                            style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                            title={row.pdfError}
                          >
                            Error PDF
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            aria-label={
                              regenerarPdfId === row.id ? "Regenerando PDF…" : "Reintentar generar PDF"
                            }
                            title={
                              regenerarPdfId === row.id ? "Regenerando…" : "Reintentar PDF"
                            }
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "2.25rem",
                              height: "2.25rem",
                              padding: 0,
                            }}
                            disabled={regenerarPdfId === row.id}
                            onClick={() => void reintentarPdfReporte(row.id)}
                          >
                            {regenerarPdfId === row.id ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  width: "1rem",
                                  height: "1rem",
                                  border: "2px solid var(--text-muted)",
                                  borderTopColor: "currentColor",
                                  borderRadius: "50%",
                                  animation: "gf-spin 0.8s linear infinite",
                                }}
                                aria-hidden
                              />
                            ) : (
                              <IconReintentar />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>—</span>
                      )}
                    </td>
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
