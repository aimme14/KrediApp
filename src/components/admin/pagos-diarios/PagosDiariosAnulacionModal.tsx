"use client";

import type { PagoDiarioAdminItem } from "@/hooks/usePagosDiariosAdmin";
import {
  formatHoraPagosDiarios,
  formatMontoPagosDiarios,
  labelMetodoPagosDiarios,
} from "@/lib/pagos-diarios-display";

type Props = {
  item: PagoDiarioAdminItem;
  motivo: string;
  confirmacionMarcada: boolean;
  cargando: boolean;
  errorModal: string | null;
  onMotivoChange: (v: string) => void;
  onConfirmacionMarcadaChange: (marcada: boolean) => void;
  onConfirmar: () => void;
  onCerrar: () => void;
};

export default function PagosDiariosAnulacionModal({
  item,
  motivo,
  confirmacionMarcada,
  cargando,
  errorModal,
  onMotivoChange,
  onConfirmacionMarcadaChange,
  onConfirmar,
  onCerrar,
}: Props) {
  return (
    <div
      className="modal-confirmar-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-anulacion-titulo"
      style={{ zIndex: 1200 }}
    >
      <div
        className="modal-confirmar-backdrop"
        aria-hidden
        onClick={() => {
          if (!cargando) onCerrar();
        }}
      />
      <div className="modal-confirmar-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-confirmar-titulo" id="modal-anulacion-titulo">
          Anular cobro
        </h3>

        <div className="pagos-diarios-anular-resumen">
          <div>
            <strong>Cliente:</strong> {item.clienteNombre}
          </div>
          <div>
            <strong>Monto:</strong> {formatMontoPagosDiarios(item.monto)}
          </div>
          <div>
            <strong>Método:</strong> {labelMetodoPagosDiarios(item.metodoPago)}
          </div>
          <div>
            <strong>Hora:</strong> {formatHoraPagosDiarios(item.fecha)}
          </div>
          <div>
            <strong>Ruta:</strong> {item.rutaNombre}
          </div>
          <div className="pagos-diarios-anular-resumen-aviso">
            El saldo pendiente del préstamo aumentará en{" "}
            <strong>{formatMontoPagosDiarios(item.monto)}</strong>.
          </div>
          {item.metodoPago === "transferencia" && (
            <div className="pagos-diarios-anular-resumen-nota">
              La evidencia de transferencia quedará en el historial del préstamo.
            </div>
          )}
        </div>

        <label className="pagos-diarios-anular-label">
          <span>Motivo de anulación (opcional)</span>
          <textarea
            className="pagos-diarios-anular-textarea"
            value={motivo}
            onChange={(e) => onMotivoChange(e.target.value)}
            disabled={cargando}
            placeholder="Describe el motivo de la anulación (opcional)"
            rows={3}
          />
        </label>

        <label className="modal-confirmar-checkbox-label">
          <input
            type="checkbox"
            checked={confirmacionMarcada}
            disabled={cargando}
            onChange={(e) => onConfirmacionMarcadaChange(e.target.checked)}
          />
          <span>
            Confirmo que deseo <strong>anular este cobro</strong> y entiendo que se revertirá el saldo
            del préstamo y los movimientos asociados.
          </span>
        </label>

        {errorModal && (
          <p role="alert" className="pagos-diarios-anular-error">
            {errorModal}
          </p>
        )}

        <div className="modal-confirmar-actions">
          <button type="button" onClick={onCerrar} disabled={cargando} className="btn btn-secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!confirmacionMarcada || cargando}
            className="btn btn-danger"
          >
            {cargando ? "Anulando…" : "Confirmar anulación"}
          </button>
        </div>
      </div>
    </div>
  );
}
