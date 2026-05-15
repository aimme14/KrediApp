"use client";

import type { CapitalHistorialEntry } from "@/lib/capital";

const FLUJO_UI_LIMIT = 50;

function etiquetaTipoFlujo(tipo: string | undefined): string {
  switch (tipo) {
    case "cuadrar_caja":
    case "definicion_capital":
      return "Cuadrar caja";
    case "ajuste_caja":
      return "Ajuste de base";
    case "inversion_admin":
      return "Transferencia a administrador (histórico)";
    case "gasto_empresa":
      return "Gasto de empresa";
    case "asignacion_nuevo_admin":
      return "Asignación a nuevo administrador";
    case "inversion_caja_admin":
    case "traspaso_base_admin":
      return "Inversión a caja de administrador";
    default:
      return "Cambio de capital";
  }
}

function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSoloHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function montoInversionHistorial(entry: CapitalHistorialEntry): number | null {
  if (typeof entry.montoTransferencia === "number" && entry.montoTransferencia > 0) {
    return entry.montoTransferencia;
  }
  if (
    typeof entry.cajaAnterior === "number" &&
    typeof entry.cajaNueva === "number" &&
    entry.cajaAnterior > entry.cajaNueva
  ) {
    return Math.round((entry.cajaAnterior - entry.cajaNueva) * 100) / 100;
  }
  return null;
}

function esHistorialInversionAzul(entry: CapitalHistorialEntry): boolean {
  const m = montoInversionHistorial(entry);
  if (m == null) return false;
  const t = entry.tipo;
  if (t === "inversion_caja_admin" || t === "traspaso_base_admin") return true;
  if (t === "asignacion_nuevo_admin" || t === "inversion_admin") {
    return entry.montoNuevo === entry.montoAnterior;
  }
  return false;
}

export function HistorialCambiosList({
  historial,
  keyPrefix,
}: {
  historial: CapitalHistorialEntry[];
  keyPrefix: string;
}) {
  if (historial.length === 0) {
    return <p className="gf-historial-empty">Sin cambios registrados aún.</p>;
  }

  return (
    <ul className="gf-historial-list">
      {historial.slice(0, FLUJO_UI_LIMIT).map((entry, i) => {
        const diff = entry.montoNuevo - entry.montoAnterior;
        const azul = esHistorialInversionAzul(entry);
        const mInv = montoInversionHistorial(entry);
        return (
          <li
            key={entry.id ? `${keyPrefix}-${entry.id}` : `${keyPrefix}-${entry.at}-${i}`}
            className="gf-historial-item"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <span className="gf-historial-emoji" aria-hidden>
              {azul ? "📘" : entry.montoNuevo >= entry.montoAnterior ? "📈" : "📉"}
            </span>
            <div className="gf-historial-body">
              <span className="gf-historial-text">{etiquetaTipoFlujo(entry.tipo)}</span>
              <span className="gf-historial-detalle">
                {azul && mInv != null ? (
                  <>
                    <span className="gf-historial-capital-neutro">
                      {diff === 0
                        ? `Capital total sin cambio neto (${formatMonto(entry.montoAnterior)})`
                        : `Capital ${formatMonto(entry.montoAnterior)} → ${formatMonto(entry.montoNuevo)}`}
                    </span>
                    <span className="gf-historial-inversion-wrap">
                      <span className="gf-historial-inversion-label"> · Inversión </span>
                      <span className="gf-diff-inversion">{formatMonto(mInv)}</span>
                      {entry.adminNombre ? (
                        <span className="gf-historial-admin-sufijo"> · {entry.adminNombre}</span>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    {formatMonto(entry.montoAnterior)} → {formatMonto(entry.montoNuevo)}
                    <span
                      className={
                        entry.montoNuevo >= entry.montoAnterior ? "gf-diff-up" : "gf-diff-down"
                      }
                    >
                      {entry.montoNuevo >= entry.montoAnterior ? "+" : ""}
                      {formatMonto(entry.montoNuevo - entry.montoAnterior)}
                    </span>
                  </>
                )}
              </span>
            </div>
            <span className="gf-historial-hora">{formatSoloHora(entry.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}
