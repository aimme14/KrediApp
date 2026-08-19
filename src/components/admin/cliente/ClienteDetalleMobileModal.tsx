"use client";

import { useEffect } from "react";
import type { ClienteItem } from "@/lib/empresa-api";
import { formatClienteCodigoRutaYNumero } from "@/lib/empresa-api";

type Props = {
  cliente: ClienteItem;
  rutaNombre: string;
  onCerrar: () => void;
};

export default function ClienteDetalleMobileModal({
  cliente,
  rutaNombre,
  onCerrar,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const codigoDisplay = cliente.codigo
    ? formatClienteCodigoRutaYNumero(cliente.codigo)
    : null;

  return (
    <div
      className="gf-modal-backdrop gf-modal-backdrop--cliente-detalle"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        className="gf-modal gf-modal--cliente-detalle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cliente-detalle-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prestamo-detalle-handle" aria-hidden />

        <h2 id="cliente-detalle-modal-title" className="gf-modal-title">
          {cliente.nombre}
        </h2>
        {codigoDisplay && (
          <p className="prestamo-detalle-codigo">{codigoDisplay}</p>
        )}

        <dl className="prestamo-detalle-grid">
          <div className="prestamo-detalle-row">
            <dt>Ubicación</dt>
            <dd>{cliente.ubicacion?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Dirección</dt>
            <dd>{cliente.direccion?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Teléfono</dt>
            <dd>{cliente.telefono?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Cédula</dt>
            <dd>{cliente.cedula?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Ruta</dt>
            <dd>{rutaNombre || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Préstamo activo</dt>
            <dd>{cliente.prestamo_activo ? "Sí" : "No"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Moroso</dt>
            <dd>{cliente.moroso ? "Sí (excluido)" : "No"}</dd>
          </div>
        </dl>

        <div className="prestamo-detalle-actions">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
