"use client";

import { useEffect } from "react";
import type { UserProfile } from "@/types/roles";

type Props = {
  empleado: UserProfile;
  rutaNombre: string;
  onCerrar: () => void;
};

export default function EmpleadoDetalleMobileModal({
  empleado,
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

  return (
    <div
      className="gf-modal-backdrop gf-modal-backdrop--empleado-detalle"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        className="gf-modal gf-modal--empleado-detalle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="empleado-detalle-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prestamo-detalle-handle" aria-hidden />

        <h2 id="empleado-detalle-modal-title" className="gf-modal-title">
          {empleado.displayName ?? empleado.email}
        </h2>

        <dl className="prestamo-detalle-grid">
          <div className="prestamo-detalle-row">
            <dt>Correo</dt>
            <dd>{empleado.email || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Ubicación</dt>
            <dd>{empleado.lugar?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Dirección</dt>
            <dd>{empleado.direccion?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Teléfono</dt>
            <dd>{empleado.telefono?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Cédula</dt>
            <dd>{empleado.cedula?.trim() || "—"}</dd>
          </div>
          <div className="prestamo-detalle-row">
            <dt>Ruta</dt>
            <dd>{rutaNombre || "—"}</dd>
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
