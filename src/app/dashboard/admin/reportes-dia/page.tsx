"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  inicioDiaColombiaUtc,
  finDiaColombiaUtc,
  parseFechaDiaColombia,
} from "@/lib/colombia-day-bounds";
import {
  EMPRESAS_COLLECTION,
  SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION,
  REPORTES_DIA_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { formatoCuotasRestanteTotal } from "@/lib/cuotas-display";
import {
  getPreviewEntregaReporteAdmin,
  getReporteDiaPdfUrl,
  regenerarReporteDiaPdf,
  aprobarSolicitudEntregaReporte,
  rechazarSolicitudEntregaReporte,
  type ReporteDiaItem,
  type SolicitudEntregaPendienteAdmin,
  type CobrosDelDiaEmpleadoResponse,
} from "@/lib/empresa-api";
import { ModalConfirmar } from "@/components/trabajador/ModalConfirmar";
import { guardOfflineWrite, useOnline } from "@/hooks/useOnline";

function normalizarMetodoPago(metodo: string | null | undefined): "efectivo" | "transferencia" | "otro" {
  const m = (metodo ?? "").trim().toLowerCase();
  if (!m) return "otro";
  if (m.includes("efectivo")) return "efectivo";
  if (m.includes("transfer")) return "transferencia";
  return "otro";
}

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

function IconBuscar({ size = REPORTES_DIA_ICON }: { size?: number }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function fechaHoyInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const online = useOnline();
  const [fecha, setFecha] = useState(fechaHoyInput);
  const [fechaBusqueda, setFechaBusqueda] = useState(fechaHoyInput);
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
  const [pendingSolicitudAprobar, setPendingSolicitudAprobar] =
    useState<SolicitudEntregaPendienteAdmin | null>(null);
  const [confirmarRecepcionMarcada, setConfirmarRecepcionMarcada] = useState(false);

  useEffect(() => {
    if (!db || !user || !profile?.empresaId) return;
    const empresaId = profile.empresaId.trim();

    const q = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION),
      where("adminId", "==", user.uid),
      where("estado", "==", "pendiente")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SolicitudEntregaPendienteAdmin[] = snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            empleadoUid: x.empleadoUid ?? "",
            empleadoNombre: x.empleadoNombre ?? "",
            rutaId: x.rutaId ?? "",
            rutaNombre: x.rutaNombre ?? "",
            estado: x.estado ?? "",
            comentarioTrabajador: x.comentarioTrabajador ?? null,
            montoAlSolicitar: typeof x.montoAlSolicitar === "number" ? x.montoAlSolicitar : 0,
            creadaEn: x.creadaEn?.toDate?.()?.toISOString?.() ?? null,
          };
        });
        setSolicitudes(list);
      },
      (err) => {
        console.warn("[ReportesDia] onSnapshot solicitudes:", err);
      }
    );

    return unsub;
  }, [user?.uid, profile?.empresaId]);

  useEffect(() => {
    if (!db || !user || !profile?.empresaId) return;
    if (!parseFechaDiaColombia(fechaBusqueda).ok) {
      setLoading(false);
      return;
    }
    const empresaId = profile.empresaId.trim();

    const start = inicioDiaColombiaUtc(fechaBusqueda);
    const end = finDiaColombiaUtc(fechaBusqueda);
    if (!start || !end) return;

    setLoading(true);

    const q = query(
      collection(db, EMPRESAS_COLLECTION, empresaId, REPORTES_DIA_SUBCOLLECTION),
      where("adminId", "==", user.uid),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ReporteDiaItem[] = snap.docs.map((d) => {
          const x = d.data();
          const comentarioRaw = x.comentario;
          const comentario =
            typeof comentarioRaw === "string" && comentarioRaw.trim()
              ? comentarioRaw.trim()
              : null;
          const pdfStoragePath =
            typeof x.pdfStoragePath === "string" && x.pdfStoragePath.trim()
              ? x.pdfStoragePath.trim()
              : "";
          const pdfError =
            typeof x.pdfError === "string" && x.pdfError.trim() ? x.pdfError.trim() : null;
          return {
            id: d.id,
            fechaDia: typeof x.fechaDia === "string" ? x.fechaDia : fechaBusqueda,
            rutaId: typeof x.rutaId === "string" ? x.rutaId : "",
            rutaNombre: typeof x.rutaNombre === "string" ? x.rutaNombre : "",
            empleadoId: typeof x.empleadoId === "string" ? x.empleadoId : "",
            empleadoNombre: typeof x.empleadoNombre === "string" ? x.empleadoNombre : "",
            montoEntregado: typeof x.montoEntregado === "number" ? x.montoEntregado : 0,
            fecha: x.fecha?.toDate?.()?.toISOString?.() ?? null,
            comentario,
            tienePdf: Boolean(pdfStoragePath),
            pdfError,
          };
        });
        list.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
        setItems(list);
        setFechaDia(fechaBusqueda);
        setLoading(false);
      },
      (err) => {
        console.warn("[ReportesDia] onSnapshot reportes:", err);
        setLoading(false);
      }
    );

    return unsub;
  }, [user?.uid, profile?.empresaId, fechaBusqueda]);

  const handleBuscar = () => {
    if (!parseFechaDiaColombia(fecha).ok) {
      setError("Selecciona una fecha válida");
      return;
    }
    setError(null);
    setFechaBusqueda(fecha);
  };

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
    if (!guardOfflineWrite(online, setRegenerarPdfErr)) return;
    if (!user) return;
    setRegenerarPdfId(reporteId);
    setRegenerarPdfErr(null);
    try {
      const token = await user.getIdToken();
      await regenerarReporteDiaPdf(token, reporteId);
    } catch (e) {
      setRegenerarPdfErr(e instanceof Error ? e.message : "Error al regenerar el PDF");
    } finally {
      setRegenerarPdfId(null);
    }
  };

  const handleAprobarSolicitud = async (solicitud: SolicitudEntregaPendienteAdmin) => {
    if (!guardOfflineWrite(online, setError)) return;
    if (!user) return;
    setAccionId(solicitud.id);
    setError(null);
    try {
      const token = await user.getIdToken();
      await aprobarSolicitudEntregaReporte(token, solicitud.id);
      setPendingSolicitudAprobar(null);
      setConfirmarRecepcionMarcada(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aprobar");
    } finally {
      setAccionId(null);
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
                    disabled={accionId !== null || pendingSolicitudAprobar !== null || !online}
                    onClick={() => {
                      setConfirmarRecepcionMarcada(false);
                      setPendingSolicitudAprobar(s);
                    }}
                  >
                    Confirmar recepción (OK)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={accionId !== null || !online}
                    onClick={async () => {
                      if (!guardOfflineWrite(online, setError)) return;
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

      <div
        className="reportes-dia-filtro"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div className="form-group" style={{ maxWidth: "220px", marginBottom: 0 }}>
          <label htmlFor="reportes-dia-fecha">Fecha</label>
          <input
            id="reportes-dia-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBuscar();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary reportes-dia-buscar-btn"
          onClick={handleBuscar}
          disabled={loading && fecha === fechaBusqueda}
          aria-label="Buscar reportes del día"
          title="Buscar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.4rem",
            minHeight: "2.5rem",
            paddingLeft: "0.85rem",
            paddingRight: "0.85rem",
          }}
        >
          <IconBuscar />
          <span>Buscar</span>
        </button>
      </div>

      {fecha !== fechaBusqueda && !loading && (
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          Pulsa Buscar para cargar los reportes del{" "}
          {new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "medium" })}.
        </p>
      )}

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
                    <li>Cobrado en efectivo: {formatMonto(previewSnapshot.totalCobrosEfectivoDia)}</li>
                    <li>
                      Cobrado por transferencia:{" "}
                      {formatMonto(
                        previewSnapshot.totalCobrosLista - previewSnapshot.totalCobrosEfectivoDia
                      )}
                    </li>
                    <li>Base asignada: {formatMonto(previewSnapshot.totalBaseAsignadaDia)}</li>
                    <li>Gastos: {formatMonto(previewSnapshot.totalGastosDia)}</li>
                    <li>Préstamos: {formatMonto(previewSnapshot.totalPrestamosDesembolsoDia ?? 0)}</li>
                    {(previewSnapshot.totalPerdidasDia ?? 0) > 0 && (
                      <li style={{ color: "var(--danger, #f87171)" }}>
                        Pérdidas del día: {formatMonto(previewSnapshot.totalPerdidasDia ?? 0)}
                      </li>
                    )}
                    <li>
                      <strong>
                        A recibir en efectivo:{" "}
                        {formatMonto(
                          previewSnapshot.totalCobrosEfectivoDia +
                            previewSnapshot.totalBaseAsignadaDia -
                            previewSnapshot.totalGastosDia -
                            (previewSnapshot.totalPrestamosDesembolsoDia ?? 0)
                        )}
                      </strong>
                    </li>
                    <li>Clientes que pagaron: {previewSnapshot.cobros.length}</li>
                    <li>Clientes que no pagaron: {previewSnapshot.noPagos.length}</li>
                  </ul>
                </div>
                <div className="table-wrap">
                  <strong>Préstamos</strong>
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
                  {(() => {
                    const limite = 80;
                    const cobrosMostrados = previewSnapshot.cobros.slice(0, limite);
                    const efectivo = cobrosMostrados.filter((c) => normalizarMetodoPago(c.metodoPago) === "efectivo");
                    const transferencia = cobrosMostrados.filter(
                      (c) => normalizarMetodoPago(c.metodoPago) === "transferencia"
                    );
                    const otros = cobrosMostrados.filter((c) => normalizarMetodoPago(c.metodoPago) === "otro");

                    const renderTabla = (titulo: string, rows: typeof cobrosMostrados) => {
                      const subtotalMonto = rows.reduce((a, c) => a + c.monto, 0);
                      const subtotalTotalAPagar = rows.reduce((a, c) => a + c.totalAPagar, 0);
                      const subtotalSaldoTras = rows.reduce((a, c) => a + c.saldoPendienteTrasPago, 0);
                      return (
                        <div style={{ marginTop: "0.6rem" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.35rem" }}>
                            {titulo}
                          </div>
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
                              {rows.length === 0 ? (
                                <tr>
                                  <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                                    —
                                  </td>
                                </tr>
                              ) : (
                                rows.map((c) => (
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
                                <td style={footCellStyle}>Subtotal</td>
                                <td className="col-num" style={footCellStyle}>
                                  {formatMonto(subtotalMonto)}
                                </td>
                                <td style={footCellStyle} />
                                <td className="col-num" style={footCellStyle}>
                                  {formatMonto(subtotalTotalAPagar)}
                                </td>
                                <td className="col-num" style={footCellStyle}>
                                  {formatMonto(subtotalSaldoTras)}
                                </td>
                                <td className="col-num" style={footCellStyle} />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      );
                    };

                    if (previewSnapshot.cobros.length === 0) {
                      return (
                        <p style={{ margin: "0.5rem 0 0", color: "var(--text-muted)" }}>
                          Sin cobros este día
                        </p>
                      );
                    }

                    return (
                      <>
                        {renderTabla("Efectivo", efectivo)}
                        {renderTabla("Transferencia", transferencia)}
                        {otros.length ? renderTabla("Otros / sin método", otros) : null}
                        <div style={{ marginTop: "0.75rem" }}>
                          <table>
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
                        </div>
                        {previewSnapshot.cobros.length > limite ? (
                          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            Mostrando {limite} de {previewSnapshot.cobros.length} (el PDF incluye hasta el límite configurado).
                          </p>
                        ) : null}
                      </>
                    );
                  })()}
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
                <div className="table-wrap">
                  <strong>Pérdidas</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Motivo</th>
                        <th className="col-num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewSnapshot.perdidasDelDia ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ color: "var(--text-muted)" }}>
                            —
                          </td>
                        </tr>
                      ) : (
                        (previewSnapshot.perdidasDelDia ?? []).map((p) => (
                          <tr key={p.pagoId}>
                            <td>{p.clienteNombre}</td>
                            <td>{p.motivoPerdida ?? "—"}</td>
                            <td className="col-num" style={{ color: "var(--danger, #f87171)" }}>
                              {formatMonto(p.monto)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={footCellStyle}>Total</td>
                        <td style={footCellStyle} />
                        <td
                          className="col-num"
                          style={{
                            ...footCellStyle,
                            color: "var(--danger, #f87171)",
                          }}
                        >
                          {formatMonto(previewSnapshot.totalPerdidasDia ?? 0)}
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
          No hay entregas confirmadas para el {fechaDia || fechaBusqueda}.
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
                            disabled={regenerarPdfId === row.id || !online}
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

      {pendingSolicitudAprobar && (
        <ModalConfirmar
          titulo="Confirmar recepción del reporte"
          labelConfirmar="Sí, aceptar reporte"
          confirmando={accionId === pendingSolicitudAprobar.id}
          confirmarDeshabilitado={!online}
          confirmacionMarcada={confirmarRecepcionMarcada}
          onConfirmacionMarcadaChange={setConfirmarRecepcionMarcada}
          labelConfirmacion={
            <>
              Confirmo que revisé el cierre del día y acepto la recepción de{" "}
              <strong>{formatMonto(pendingSolicitudAprobar.montoAlSolicitar)}</strong>
            </>
          }
          onCancelar={() => {
            if (accionId === pendingSolicitudAprobar.id) return;
            setPendingSolicitudAprobar(null);
            setConfirmarRecepcionMarcada(false);
          }}
          onConfirmar={() => {
            void handleAprobarSolicitud(pendingSolicitudAprobar);
          }}
        >
          <p>
            <strong>{pendingSolicitudAprobar.empleadoNombre}</strong> te entrega el reporte diario
            de la ruta <strong>{pendingSolicitudAprobar.rutaNombre || "—"}</strong>.
          </p>
          <p>
            Efectivo a recibir:{" "}
            <strong>{formatMonto(pendingSolicitudAprobar.montoAlSolicitar)}</strong>
          </p>
          {pendingSolicitudAprobar.comentarioTrabajador ? (
            <p>
              Comentario del trabajador:{" "}
              <em>{pendingSolicitudAprobar.comentarioTrabajador}</em>
            </p>
          ) : null}
        </ModalConfirmar>
      )}
    </div>
  );
}
