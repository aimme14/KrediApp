"use client";

import { useEffect, useId, type ReactNode } from "react";

type ModalConfirmarProps = {
  titulo: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  confirmando?: boolean;
  labelConfirmar?: string;
  children: ReactNode;
  /** Segundo paso: checkbox obligatorio antes de confirmar (gastos, etc.). */
  confirmacionMarcada?: boolean;
  onConfirmacionMarcadaChange?: (marcada: boolean) => void;
  labelConfirmacion?: ReactNode;
  /** Deshabilita confirmar aunque el checkbox esté marcado (p. ej. formulario incompleto). */
  confirmarDeshabilitado?: boolean;
  /** Oculta el botón cancelar (p. ej. modal de éxito). */
  ocultarCancelar?: boolean;
  /** Si es false, clic fuera del cuadro no cierra el modal. */
  cerrarConBackdrop?: boolean;
};

export function ModalConfirmar({
  titulo,
  onConfirmar,
  onCancelar,
  confirmando = false,
  labelConfirmar = "Confirmar",
  children,
  confirmacionMarcada = false,
  onConfirmacionMarcadaChange,
  labelConfirmacion,
  confirmarDeshabilitado = false,
  ocultarCancelar = false,
  cerrarConBackdrop = true,
}: ModalConfirmarProps) {
  const requiereCheckbox = onConfirmacionMarcadaChange !== undefined;
  const puedeConfirmar =
    (!requiereCheckbox || confirmacionMarcada) && !confirmarDeshabilitado;
  const bodyId = useId();

  useEffect(() => {
    if (!cerrarConBackdrop) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || confirmando) return;
      onCancelar();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [cerrarConBackdrop, confirmando, onCancelar]);

  const handleCancelar = () => {
    if (confirmando) return;
    onCancelar();
  };

  const handleBackdropClick = () => {
    if (!cerrarConBackdrop || confirmando) return;
    onCancelar();
  };

  return (
    <div
      className="modal-confirmar-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-confirmar-titulo"
      aria-describedby={bodyId}
    >
      <div className="modal-confirmar-backdrop" onClick={handleBackdropClick} aria-hidden />
      <div className="modal-confirmar-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-confirmar-titulo" id="modal-confirmar-titulo">
          {titulo}
        </h3>
        <div className="modal-confirmar-body" id={bodyId}>
          {children}
          {requiereCheckbox ? (
            <label className="modal-confirmar-checkbox-label">
              <input
                type="checkbox"
                checked={confirmacionMarcada}
                onChange={(e) => onConfirmacionMarcadaChange(e.target.checked)}
                disabled={confirmando}
                aria-label={
                  typeof labelConfirmacion === "string"
                    ? labelConfirmacion
                    : "Confirmo que deseo continuar"
                }
              />
              <span>{labelConfirmacion ?? "Confirmo que deseo continuar"}</span>
            </label>
          ) : null}
        </div>
        <div className="modal-confirmar-actions">
          {!ocultarCancelar ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCancelar}
              disabled={confirmando}
            >
              Cancelar
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirmar}
            disabled={confirmando || !puedeConfirmar}
            aria-busy={confirmando}
            aria-disabled={confirmando || !puedeConfirmar}
          >
            {confirmando ? "Procesando..." : labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
