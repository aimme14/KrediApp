"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import type {
  CobroDiaItem,
  NoPagoDiaItem,
  PrestamoDesembolsoDiaItem,
} from "@/lib/empresa-api";
import { formatoCuotasRestanteTotal } from "@/lib/cuotas-display";

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

function formatFechaDia(yyyyMmDd: string): string {
  // yyyy-mm-dd → Date en UTC para evitar desplazamientos por zona horaria
  const date = new Date(`${yyyyMmDd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return yyyyMmDd;
  return date.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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

const TARJETA_RESUMEN_STYLE = {
  padding: "0.65rem 0.85rem",
  margin: 0,
  border: "1px solid var(--card-border)",
} as const;

function normalizaMetodoPago(metodo: string | null | undefined): string {
  return (metodo ?? "")
    .toString()
    .trim()
    .toLocaleLowerCase("es-CO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function IconoOjo(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TarjetaResumen(props: {
  etiqueta: ReactNode;
  valor: string;
  dimmed?: boolean;
}) {
  const { etiqueta, valor, dimmed } = props;
  return (
    <div
      className="card"
      style={{
        ...TARJETA_RESUMEN_STYLE,
        opacity: dimmed ? 0.75 : 1,
        borderLeft: dimmed ? "3px solid var(--card-border)" : undefined,
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
        {etiqueta}
      </span>
      <span
        style={{
          fontSize: dimmed ? "0.95rem" : "1.05rem",
          fontWeight: 700,
          color: dimmed ? "var(--text-muted)" : "var(--text)",
        }}
      >
        {valor}
      </span>
    </div>
  );
}

export default function CajaDelDiaPage() {
  const { profile } = useAuth();
  const { fechaDia, data, loading, error, tuCajaEfectivo } = useTrabajadorCajaDia();
  const cajaActual = tuCajaEfectivo ?? 0;
  const [evidenciaModalUrl, setEvidenciaModalUrl] = useState<string | null>(null);
  const evidenciaCerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!evidenciaModalUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEvidenciaModalUrl(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => evidenciaCerrarRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [evidenciaModalUrl]);

  if (!profile || profile.role !== "trabajador") return null;

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
        <div
          className="caja-del-dia-fecha"
          aria-label="Fecha (Colombia)"
          aria-live="polite"
          aria-busy={loading}
          style={{
            maxWidth: "11rem",
            flexShrink: 0,
            padding: "0.4rem 0.55rem",
            borderRadius: "8px",
            border: "1px solid var(--input-border)",
            background: "var(--input-bg)",
            color: "var(--text)",
            textAlign: "center",
            userSelect: "none",
          }}
        >
          {formatFechaDia(data?.fechaDia ?? fechaDia)}
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {loading && !data ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
      ) : data ? (
        <>
          {(() => {
            const cobros = data.cobros ?? [];
            const cobrosEfectivo = cobros.filter((c) => {
              const m = normalizaMetodoPago(c.metodoPago);
              return m === "efectivo" || m.includes("efect");
            });
            const cobrosTransferencia = cobros.filter((c) => {
              const m = normalizaMetodoPago(c.metodoPago);
              return m === "transferencia" || m.includes("transf") || m.includes("transfer");
            });
            const cobrosOtros = cobros.filter((c) => {
              const m = normalizaMetodoPago(c.metodoPago);
              const esEfectivo = m === "efectivo" || m.includes("efect");
              const esTransfer =
                m === "transferencia" || m.includes("transf") || m.includes("transfer");
              return !esEfectivo && !esTransfer;
            });

            const totalEfectivo = cobrosEfectivo.reduce((s, c) => s + c.monto, 0);
            const totalTransferencia = cobrosTransferencia.reduce((s, c) => s + c.monto, 0);
            const totalOtros = cobrosOtros.reduce((s, c) => s + c.monto, 0);

            return (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: "0.65rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <TarjetaResumen
                    etiqueta="Caja actual (efectivo)"
                    valor={formatMonto(cajaActual)}
                  />
                  <TarjetaResumen
                    etiqueta={`Base asignada (${data.fechaDia})`}
                    valor={formatMonto(data.totalBaseAsignadaDia)}
                  />
                  <TarjetaResumen
                    etiqueta="Gastos del día"
                    valor={formatMonto(data.totalGastosDia)}
                  />
                  <TarjetaResumen
                    etiqueta={`Préstamos (${data.fechaDia})`}
                    valor={formatMonto(data.totalPrestamosDesembolsoDia ?? 0)}
                  />
                  <TarjetaResumen
                    etiqueta={`Total cobrado (${data.fechaDia})`}
                    valor={formatMonto(data.totalCobrosLista)}
                  />
                  <TarjetaResumen
                    etiqueta="↳ En efectivo"
                    valor={formatMonto(totalEfectivo)}
                    dimmed
                  />
                  <TarjetaResumen
                    etiqueta="↳ Transferencia"
                    valor={formatMonto(totalTransferencia)}
                    dimmed
                  />
                  {totalOtros > 0 && (
                    <TarjetaResumen
                      etiqueta="↳ Otros métodos"
                      valor={formatMonto(totalOtros)}
                      dimmed
                    />
                  )}
                </div>

                <h3 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
                  Préstamos
                </h3>
                {(data.prestamosDesembolsoDelDia ?? []).length === 0 ? (
                  <p style={{ color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                    No hay préstamos para esta fecha.
                  </p>
                ) : (
                  <div className="table-wrap table-wrap-caja-dia" style={{ marginBottom: "1.25rem" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Hora</th>
                          <th>Cliente</th>
                          <th className="col-num">Capital entregado</th>
                          <th className="col-num">Total a pagar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.prestamosDesembolsoDelDia ?? []).map((p: PrestamoDesembolsoDiaItem) => (
                          <tr key={p.prestamoId}>
                            <td>{formatHora(p.fecha)}</td>
                            <td>{p.clienteNombre}</td>
                            <td className="col-num">{formatMonto(p.monto)}</td>
                            <td className="col-num">{formatMonto(p.totalAPagar)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>Cuotas pagadas</h3>
                {cobros.length === 0 ? (
                  <p style={{ color: "var(--text-muted)" }}>No hay cobros registrados para esta fecha.</p>
                ) : (
                  <>
                    <h4 style={{ marginTop: 0, marginBottom: "0.35rem" }}>
                      Efectivo ({cobrosEfectivo.length})
                    </h4>
                    {cobrosEfectivo.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                        No hay cobros en efectivo.
                      </p>
                    ) : (
                      <div className="table-wrap table-wrap-caja-dia" style={{ marginBottom: "0.85rem" }}>
                        <table className="caja-dia-table-cobros">
                          <thead>
                            <tr>
                              <th>Hora</th>
                              <th>Cliente</th>
                              <th className="col-num">Pagado</th>
                              <th className="col-num" title="Cuotas (rest./total)">
                                <span className="th-compact-long">Cuotas (rest./total)</span>
                                <span className="th-compact-short">Cuotas</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {cobrosEfectivo.map((c: CobroDiaItem) => (
                              <tr key={`efectivo-${c.prestamoId}-${c.pagoId}`}>
                                <td>{formatHora(c.fecha)}</td>
                                <td>{c.clienteNombre}</td>
                                <td className="col-num">{formatMonto(c.monto)}</td>
                                <td className="col-num">
                                  {formatoCuotasRestanteTotal(c.cuotasFaltantes, c.numeroCuotas)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <h4 style={{ marginTop: 0, marginBottom: "0.35rem" }}>
                      Transferencia ({cobrosTransferencia.length})
                    </h4>
                    {cobrosTransferencia.length === 0 ? (
                      <p style={{ color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                        No hay cobros por transferencia.
                      </p>
                    ) : (
                      <div className="table-wrap table-wrap-caja-dia" style={{ marginBottom: "0.85rem" }}>
                        <table className="caja-dia-table-cobros">
                          <thead>
                            <tr>
                              <th>Hora</th>
                              <th>Cliente</th>
                              <th className="col-num">Pagado</th>
                              <th className="col-evidencia">Evidencia</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cobrosTransferencia.map((c: CobroDiaItem) => (
                              <tr key={`transfer-${c.prestamoId}-${c.pagoId}`}>
                                <td>{formatHora(c.fecha)}</td>
                                <td>{c.clienteNombre}</td>
                                <td className="col-num">{formatMonto(c.monto)}</td>
                                <td className="col-evidencia caja-dia-evidencia-cell">
                                  {c.evidencia ? (
                                    <button
                                      type="button"
                                      className="caja-dia-evidencia-btn"
                                      onClick={() => setEvidenciaModalUrl(c.evidencia!)}
                                      aria-label={`Ver evidencia del cobro de ${c.clienteNombre}`}
                                    >
                                      <IconoOjo />
                                    </button>
                                  ) : (
                                    <span style={{ color: "var(--text-muted)" }}>—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {cobrosOtros.length > 0 && (
                      <>
                        <h4 style={{ marginTop: 0, marginBottom: "0.35rem" }}>
                          Otros ({cobrosOtros.length})
                        </h4>
                        <div className="table-wrap table-wrap-caja-dia">
                          <table className="caja-dia-table-cobros">
                            <thead>
                              <tr>
                                <th>Hora</th>
                                <th>Cliente</th>
                                <th className="col-num">Pagado</th>
                                <th>Método</th>
                                <th className="col-num" title="Cuotas (rest./total)">
                                  <span className="th-compact-long">Cuotas (rest./total)</span>
                                  <span className="th-compact-short">Cuotas</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {cobrosOtros.map((c: CobroDiaItem) => (
                                <tr key={`otros-${c.prestamoId}-${c.pagoId}`}>
                                  <td>{formatHora(c.fecha)}</td>
                                  <td>{c.clienteNombre}</td>
                                  <td className="col-num">{formatMonto(c.monto)}</td>
                                  <td>{c.metodoPago ?? "—"}</td>
                                  <td className="col-num">
                                    {formatoCuotasRestanteTotal(c.cuotasFaltantes, c.numeroCuotas)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            );
          })()}

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
          </p>
          {(data.noPagos ?? []).length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>
              No hay registros de no pago para esta fecha.
            </p>
          ) : (
            <div className="table-wrap table-wrap-caja-dia">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Motivo</th>
                    <th>Nota</th>
                    <th className="col-num" title="Cuotas (pend./total)">
                      <span className="th-compact-long">Cuotas (pend./total)</span>
                      <span className="th-compact-short">Cuotas</span>
                    </th>
                    <th className="col-num">Total debe</th>
                    <th className="col-num">Total préstamo</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.noPagos ?? []).map((n: NoPagoDiaItem) => (
                    <tr key={`no-${n.prestamoId}-${n.pagoId}`}>
                      <td>{n.clienteNombre}</td>
                      <td>{labelMotivoNoPago(n.motivoNoPago)}</td>
                      <td>{n.nota ?? "—"}</td>
                      <td className="col-num">
                        {formatoCuotasRestanteTotal(n.cuotasPendientes, n.numeroCuotas)}
                      </td>
                      <td className="col-num">{formatMonto(n.saldoPendientePrestamoActual)}</td>
                      <td className="col-num">{formatMonto(n.totalAPagar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.gastosDelDia.length > 0 && (
            <>
              <h3 style={{ fontSize: "1.05rem", marginTop: "1.25rem", marginBottom: "0.5rem" }}>Gastos del día</h3>
              <div className="table-wrap table-wrap-caja-dia">
                <table>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Motivo</th>
                      <th>Descripción</th>
                      <th className="col-num">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gastosDelDia.map((g) => (
                      <tr key={g.id}>
                        <td>{formatHora(g.fecha)}</td>
                        <td>{g.motivo || "—"}</td>
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

      {evidenciaModalUrl ? (
        <div
          className="caja-dia-evidencia-backdrop"
          role="presentation"
          onClick={() => setEvidenciaModalUrl(null)}
        >
          <div
            className="caja-dia-evidencia-dialog card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="caja-dia-evidencia-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="caja-dia-evidencia-dialog-head">
              <h3 id="caja-dia-evidencia-titulo" style={{ margin: 0, fontSize: "1rem" }}>
                Evidencia del cobro
              </h3>
              <button
                ref={evidenciaCerrarRef}
                type="button"
                className="btn-secondary caja-dia-evidencia-cerrar"
                onClick={() => setEvidenciaModalUrl(null)}
              >
                Cerrar
              </button>
            </div>
            <div className="caja-dia-evidencia-img-wrap">
              <img
                src={evidenciaModalUrl}
                alt="Comprobante de transferencia"
                className="caja-dia-evidencia-img"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
