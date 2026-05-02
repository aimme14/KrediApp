"use client";

import { useState, useEffect, useCallback } from "react";
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
                  · {previewMeta.empleadoNombre} · {previewMeta.rutaNombre || "—"} · Monto solicitado:{" "}
                  {formatMonto(previewMeta.montoAlSolicitar)}
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
            {previewSnapshot && !previewLoading && (
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
                  </table>
                </div>
              </div>
            )}
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
                    <td>
                      {row.tienePdf ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                          disabled={pdfLoadingId === row.id}
                          onClick={() => void abrirPdfReporte(row.id)}
                        >
                          {pdfLoadingId === row.id ? "…" : "Descargar"}
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
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.85rem" }}
                            disabled={regenerarPdfId === row.id}
                            onClick={() => void reintentarPdfReporte(row.id)}
                          >
                            {regenerarPdfId === row.id ? "Regenerando…" : "Reintentar PDF"}
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
