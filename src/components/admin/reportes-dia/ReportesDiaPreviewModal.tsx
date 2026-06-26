"use client";

import type { CSSProperties } from "react";
import type { CobrosDelDiaEmpleadoResponse } from "@/lib/empresa-api";
import { formatoCuotasRestanteTotal } from "@/lib/cuotas-display";
import {
  fechaDiaCalendarioDesdeISO,
  formatFechaDia,
} from "@/lib/colombia-day-bounds";
import {
  formatMontoReporteDia,
  normalizarMetodoPagoReporteDia,
  totalesVistaPreviaReporte,
  type ReporteDiaPreviewMeta,
} from "@/lib/reportes-dia-display";

type Props = {
  previewMeta: ReporteDiaPreviewMeta | null;
  previewSnapshot: CobrosDelDiaEmpleadoResponse | null;
  previewLoading: boolean;
  previewErr: string | null;
  onClose: () => void;
};

export default function ReportesDiaPreviewModal({
  previewMeta,
  previewSnapshot,
  previewLoading,
  previewErr,
  onClose,
}: Props) {
  return (
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
          onClick={() => onClose()}
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
              <button type="button" className="btn btn-secondary" onClick={() => onClose()}>
                Cerrar
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 0 }}>
              <strong>
                {previewSnapshot?.fechaDesdeISO
                  ? `${formatFechaDia(fechaDiaCalendarioDesdeISO(previewSnapshot.fechaDesdeISO) ?? "")} – ${formatFechaDia(previewSnapshot.fechaDia)}`
                  : previewMeta?.fechaDiaPreview ?? "—"}
              </strong>
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
                    <li>Cobrado en efectivo: {formatMontoReporteDia(previewSnapshot.totalCobrosEfectivoDia)}</li>
                    <li>
                      Cobrado por transferencia:{" "}
                      {formatMontoReporteDia(
                        previewSnapshot.totalCobrosLista - previewSnapshot.totalCobrosEfectivoDia
                      )}
                    </li>
                    <li>Base asignada: {formatMontoReporteDia(previewSnapshot.totalBaseAsignadaDia)}</li>
                    <li>Gastos: {formatMontoReporteDia(previewSnapshot.totalGastosDia)}</li>
                    <li>Préstamos: {formatMontoReporteDia(previewSnapshot.totalPrestamosDesembolsoDia ?? 0)}</li>
                    {(previewSnapshot.totalPerdidasDia ?? 0) > 0 && (
                      <li style={{ color: "var(--danger, #f87171)" }}>
                        Pérdidas del día: {formatMontoReporteDia(previewSnapshot.totalPerdidasDia ?? 0)}
                      </li>
                    )}
                    <li>
                      <strong>
                        A recibir en efectivo:{" "}
                        {formatMontoReporteDia(
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
                {(previewSnapshot.diasDelPeriodo ?? []).length > 1 ? (
                  <div>
                    <strong>Desglose por día</strong>
                    {(previewSnapshot.diasDelPeriodo ?? []).map((dia) => (
                      <div
                        key={dia.fechaDia}
                        style={{
                          borderTop: "1px solid var(--card-border)",
                          paddingTop: "0.75rem",
                          marginTop: "0.75rem",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>
                          {formatFechaDia(dia.fechaDia)}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                          <li>Efectivo: {formatMontoReporteDia(dia.totalCobrosEfectivo)}</li>
                          <li>
                            Transferencia: {formatMontoReporteDia(dia.totalCobrosTransferencia)}
                          </li>
                          <li>Gastos: {formatMontoReporteDia(dia.totalGastos)}</li>
                          <li>Total cobros: {formatMontoReporteDia(dia.totalCobros)}</li>
                          <li>Cobros: {dia.cobros.length}</li>
                          <li>No pagó: {dia.noPagos.length}</li>
                          <li>Pérdidas: {dia.perdidasDelDia.length}</li>
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                            <td className="col-num">{formatMontoReporteDia(p.monto)}</td>
                            <td className="col-num">{formatMontoReporteDia(p.totalAPagar)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={footCellStyle}>Total</td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMontoReporteDia(t.prestamosCapital)}
                        </td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMontoReporteDia(t.prestamosTotalAPagar)}
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
                    const efectivo = cobrosMostrados.filter((c) => normalizarMetodoPagoReporteDia(c.metodoPago) === "efectivo");
                    const transferencia = cobrosMostrados.filter(
                      (c) => normalizarMetodoPagoReporteDia(c.metodoPago) === "transferencia"
                    );
                    const otros = cobrosMostrados.filter((c) => normalizarMetodoPagoReporteDia(c.metodoPago) === "otro");

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
                                    <td className="col-num">{formatMontoReporteDia(c.monto)}</td>
                                    <td>{c.metodoPago ?? "—"}</td>
                                    <td className="col-num">{formatMontoReporteDia(c.totalAPagar)}</td>
                                    <td className="col-num">{formatMontoReporteDia(c.saldoPendienteTrasPago)}</td>
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
                                  {formatMontoReporteDia(subtotalMonto)}
                                </td>
                                <td style={footCellStyle} />
                                <td className="col-num" style={footCellStyle}>
                                  {formatMontoReporteDia(subtotalTotalAPagar)}
                                </td>
                                <td className="col-num" style={footCellStyle}>
                                  {formatMontoReporteDia(subtotalSaldoTras)}
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
                                  {formatMontoReporteDia(t.cobrosMonto)}
                                </td>
                                <td style={footCellStyle} />
                                <td className="col-num" style={footCellStyle}>
                                  {formatMontoReporteDia(t.cobrosTotalAPagar)}
                                </td>
                                <td className="col-num" style={footCellStyle}>
                                  {formatMontoReporteDia(t.cobrosSaldoTras)}
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
                            <td className="col-num">{formatMontoReporteDia(n.saldoPendientePrestamoActual)}</td>
                            <td className="col-num">{formatMontoReporteDia(n.totalAPagar)}</td>
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
                          {formatMontoReporteDia(t.noPagoDebe)}
                        </td>
                        <td className="col-num" style={footCellStyle}>
                          {formatMontoReporteDia(t.noPagoTotalPrestamo)}
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
                            <td className="col-num">{formatMontoReporteDia(g.monto)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={footCellStyle}>Total</td>
                        <td style={footCellStyle} />
                        <td className="col-num" style={footCellStyle}>
                          {formatMontoReporteDia(t.gastosMonto)}
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
                              {formatMontoReporteDia(p.monto)}
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
                          {formatMontoReporteDia(previewSnapshot.totalPerdidasDia ?? 0)}
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
  );
}
