"use client";

import dynamic from "next/dynamic";
import type { ClienteItem } from "@/lib/empresa-api";
import type { MotivoNoPago } from "@/types/finanzas";
import { MOTIVOS_NO_PAGO } from "@/lib/cobrar-utils";
import { OFFLINE_MSG } from "@/hooks/useOnline";

const ModalConfirmar = dynamic(
  () => import("@/components/trabajador/ModalConfirmar").then((m) => ({ default: m.ModalConfirmar })),
  { ssr: false }
);

type Props = {
  cliente: ClienteItem;
  motivoNoPago: MotivoNoPago | "";
  notaNoPago: string;
  error: string | null;
  online: boolean;
  submittingNoPago: boolean;
  showModalNoPago: boolean;
  onMotivoChange: (v: MotivoNoPago | "") => void;
  onNotaChange: (v: string) => void;
  onCancelar: () => void;
  onRevisar: () => void;
  onCerrarModal: () => void;
  onConfirmar: () => void;
};

export default function CobrarNoPagoPanel({
  cliente,
  motivoNoPago,
  notaNoPago,
  error,
  online,
  submittingNoPago,
  showModalNoPago,
  onMotivoChange,
  onNotaChange,
  onCancelar,
  onRevisar,
  onCerrarModal,
  onConfirmar,
}: Props) {
  const motivoNoPagoLabel = MOTIVOS_NO_PAGO.find((m) => m.value === motivoNoPago)?.label ?? motivoNoPago;
  const notaNoPagoTrim = notaNoPago.trim();

  return (
    <div className="card cobrar-card">
      <div className="cobrar-header">
        <h2 className="cobrar-title">No pagó</h2>
        <p className="cobrar-subtitle">{cliente.nombre}</p>
      </div>
      <p className="cobrar-text">Indica el motivo para registrar la visita sin cobro.</p>
      <div className="form-group">
        <label>Motivo</label>
        <select
          value={motivoNoPago}
          onChange={(e) => onMotivoChange(e.target.value as MotivoNoPago)}
          className="cobrar-select"
        >
          <option value="">Seleccionar...</option>
          {MOTIVOS_NO_PAGO.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Nota (opcional)</label>
        <input
          type="text"
          value={notaNoPago}
          onChange={(e) => onNotaChange(e.target.value)}
          placeholder="Detalle adicional"
          className="cobrar-input"
        />
      </div>
      {error && <p className="error-msg">{error}</p>}
      {!online && <p className="error-msg" role="alert">{OFFLINE_MSG}</p>}
      <div className="cobrar-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!motivoNoPago || submittingNoPago || showModalNoPago || !online}
          onClick={onRevisar}
        >
          Confirmar no pago
        </button>
      </div>
      {showModalNoPago && (
        <ModalConfirmar
          titulo="Confirmar no pago"
          labelConfirmar="Sí, registrar no pago"
          confirmando={submittingNoPago}
          confirmarDeshabilitado={!online}
          onCancelar={() => {
            if (submittingNoPago) return;
            onCerrarModal();
          }}
          onConfirmar={onConfirmar}
        >
          <p>
            ¿Confirmas registrar que <strong>{cliente.nombre}</strong> no realizó el pago en esta visita?
          </p>
          <p>
            Motivo: <strong>{motivoNoPagoLabel}</strong>
          </p>
          {notaNoPagoTrim && (
            <p>
              Nota: <strong>{notaNoPagoTrim}</strong>
            </p>
          )}
        </ModalConfirmar>
      )}
    </div>
  );
}
