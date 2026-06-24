"use client";

import dynamic from "next/dynamic";
import type { ClienteItem, PrestamoItem } from "@/lib/empresa-api";
import type { MotivoPerdida } from "@/types/finanzas";
import { formatCurrencyCobro, MOTIVOS_PERDIDA } from "@/lib/cobrar-utils";
import { OFFLINE_MSG } from "@/hooks/useOnline";

const ModalConfirmar = dynamic(
  () => import("@/components/trabajador/ModalConfirmar").then((m) => ({ default: m.ModalConfirmar })),
  { ssr: false }
);

type DesglosePerdida = {
  saldoPendiente: number;
  capitalNoRecuperado: number;
  interesNoCobradoEnSaldo: number;
  capitalRecuperado: boolean;
};

type Props = {
  cliente: ClienteItem;
  prestamo: PrestamoItem;
  motivoPerdida: MotivoPerdida | "";
  notaPerdida: string;
  desglosePerdida: DesglosePerdida | null;
  error: string | null;
  online: boolean;
  submittingPerdida: boolean;
  showModalPerdida: boolean;
  onMotivoChange: (v: MotivoPerdida | "") => void;
  onNotaChange: (v: string) => void;
  onCancelar: () => void;
  onRevisar: () => void;
  onCerrarModal: () => void;
  onConfirmar: () => void;
};

export default function CobrarPerdidaPanel({
  cliente,
  prestamo,
  motivoPerdida,
  notaPerdida,
  desglosePerdida,
  error,
  online,
  submittingPerdida,
  showModalPerdida,
  onMotivoChange,
  onNotaChange,
  onCancelar,
  onRevisar,
  onCerrarModal,
  onConfirmar,
}: Props) {
  const motivoPerdidaLabel = MOTIVOS_PERDIDA.find((m) => m.value === motivoPerdida)?.label ?? motivoPerdida;
  const notaPerdidaTrim = notaPerdida.trim();

  return (
    <div className="card cobrar-card">
      <div className="cobrar-header">
        <h2 className="cobrar-title">Registrar pérdida</h2>
        <p className="cobrar-subtitle">{cliente.nombre}</p>
      </div>
      <p className="cobrar-text">
        Indica el motivo para castigar el saldo pendiente del préstamo. Esta acción no se puede deshacer.
      </p>
      {desglosePerdida ? (
        <>
          <p style={{ fontSize: "0.9375rem", marginTop: "0.25rem" }}>
            Saldo pendiente: <strong>{formatCurrencyCobro(desglosePerdida.saldoPendiente)}</strong>
          </p>
          <div
            style={{
              background: "var(--bg)",
              borderRadius: "var(--radius)",
              padding: "0.75rem",
              fontSize: "0.875rem",
              marginTop: "0.5rem",
            }}
          >
            <p style={{ margin: "0 0 0.35rem", color: "var(--text-muted)" }}>Impacto real en la ruta:</p>
            {desglosePerdida.capitalNoRecuperado > 0 ? (
              <>
                <p style={{ margin: "0 0 0.25rem" }}>
                  Capital a descontar de inversiones:{" "}
                  <strong style={{ color: "var(--danger, #dc2626)" }}>
                    {formatCurrencyCobro(desglosePerdida.capitalNoRecuperado)}
                  </strong>
                </p>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  Los {formatCurrencyCobro(desglosePerdida.interesNoCobradoEnSaldo)} restantes corresponden a interés no
                  cobrado.
                </p>
              </>
            ) : (
              <p style={{ margin: 0 }}>Capital ya recuperado completo — solo se ajustan ganancias.</p>
            )}
          </div>
        </>
      ) : null}
      <div className="form-group" style={{ marginTop: "0.75rem" }}>
        <label htmlFor="cobrar-motivo-perdida">Motivo</label>
        <select
          id="cobrar-motivo-perdida"
          value={motivoPerdida}
          onChange={(e) => onMotivoChange(e.target.value as MotivoPerdida)}
          className="cobrar-select"
          disabled={submittingPerdida}
        >
          <option value="">Seleccionar...</option>
          {MOTIVOS_PERDIDA.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="cobrar-nota-perdida">Nota (opcional)</label>
        <input
          id="cobrar-nota-perdida"
          type="text"
          value={notaPerdida}
          onChange={(e) => onNotaChange(e.target.value)}
          placeholder="Detalle adicional"
          className="cobrar-input"
          disabled={submittingPerdida}
        />
      </div>
      {error && <p className="error-msg">{error}</p>}
      {!online && <p className="error-msg" role="alert">{OFFLINE_MSG}</p>}
      <div className="cobrar-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={submittingPerdida}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={
            !motivoPerdida ||
            (prestamo.saldoPendiente ?? 0) <= 0 ||
            submittingPerdida ||
            showModalPerdida ||
            !online
          }
          onClick={onRevisar}
        >
          Revisar pérdida
        </button>
      </div>
      {showModalPerdida && (
        <ModalConfirmar
          titulo="Confirmar pérdida"
          labelConfirmar="Sí, registrar pérdida"
          confirmando={submittingPerdida}
          confirmarDeshabilitado={!online}
          onCancelar={() => {
            if (submittingPerdida) return;
            onCerrarModal();
          }}
          onConfirmar={onConfirmar}
        >
          <p>
            ¿Confirmas registrar la pérdida del préstamo de <strong>{cliente.nombre}</strong>?
          </p>
          {desglosePerdida ? (
            desglosePerdida.capitalNoRecuperado > 0 ? (
              <p>
                Capital a descontar de inversiones:{" "}
                <strong style={{ color: "var(--danger, #dc2626)" }}>
                  {formatCurrencyCobro(desglosePerdida.capitalNoRecuperado)}
                </strong>
              </p>
            ) : (
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Capital ya recuperado completo — solo se ajustan ganancias en la ruta.
              </p>
            )
          ) : null}
          <p>
            Motivo: <strong>{motivoPerdidaLabel}</strong>
          </p>
          {notaPerdidaTrim ? (
            <p>
              Nota: <strong>{notaPerdidaTrim}</strong>
            </p>
          ) : null}
        </ModalConfirmar>
      )}
    </div>
  );
}
