"use client";

import { useEffect, useId, type ReactNode } from "react";

type ModalConfirmarProps = {
  titulo: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  confirmando?: boolean;
  labelConfirmar?: string;
  children: ReactNode;
};

export function ModalConfirmar({
  titulo,
  onConfirmar,
  onCancelar,
  confirmando = false,
  labelConfirmar = "Confirmar",
  children,
}: ModalConfirmarProps) {
  const bodyId = useId();

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || confirmando) return;
      onCancelar();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [confirmando, onCancelar]);

  const handleCancelar = () => {
    if (confirmando) return;
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
      <div className="modal-confirmar-backdrop" onClick={handleCancelar} aria-hidden />
      <div className="modal-confirmar-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-confirmar-titulo" id="modal-confirmar-titulo">
          {titulo}
        </h3>
        <div className="modal-confirmar-body" id={bodyId}>
          {children}
        </div>
        <div className="modal-confirmar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancelar}
            disabled={confirmando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirmar}
            disabled={confirmando}
            aria-busy={confirmando}
          >
            {confirmando ? "Procesando..." : labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
