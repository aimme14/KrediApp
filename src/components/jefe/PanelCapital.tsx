"use client";

import { HistorialCambiosList } from "./HistorialCambiosList";
import type { CapitalHistorialEntry } from "@/lib/capital";

function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function PanelCapital({
  monto,
  loading,
  error,
  historial,
}: {
  monto: number;
  loading: boolean;
  error: string | null;
  historial: CapitalHistorialEntry[];
}) {
  return (
    <>
      <div className="gf-capital-card card">
        <div className="gf-capital-card-header">
          <div className="gf-capital-card-title-wrap">
            <span className="gf-capital-icon" aria-hidden>
              🏢
            </span>
            <h2 className="gf-capital-card-title">Capital de la empresa</h2>
          </div>
          <span className="gf-capital-badge-privado">🔒 Privado</span>
        </div>
        {loading ? (
          <p className="gf-loading">Cargando…</p>
        ) : (
          <div className="gf-capital-display">
            <span className="gf-capital-label">CAPITAL TOTAL</span>
            <span className="gf-capital-monto" aria-live="polite">
              ${formatMonto(monto)}
            </span>
          </div>
        )}
        {error && (
          <p className="gf-msg gf-msg-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="gf-historial-card card">
        <div className="gf-historial-header">
          <h2 className="gf-historial-title">
            <span className="gf-historial-icon" aria-hidden>
              🕐
            </span>
            HISTORIAL DE CAMBIOS
          </h2>
        </div>
        <HistorialCambiosList historial={historial} keyPrefix="cap" />
      </div>
    </>
  );
}
