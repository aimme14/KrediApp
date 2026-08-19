"use client";

import { useEffect, useRef } from "react";
import type { ClienteItem } from "@/lib/empresa-api";

type Props = {
  cliente: ClienteItem;
  abierto: boolean;
  onToggle: () => void;
  onCerrar: () => void;
  onEditar: () => void;
  onHistorial: () => void;
  onEliminar: () => void;
  eliminarDisabled: boolean;
  eliminarTitle: string;
};

export default function ClienteAccionesMenuMobile({
  cliente,
  abierto,
  onToggle,
  onCerrar,
  onEditar,
  onHistorial,
  onEliminar,
  eliminarDisabled,
  eliminarTitle,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        onCerrar();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [abierto, onCerrar]);

  const elegir = (fn: () => void) => {
    onCerrar();
    fn();
  };

  return (
    <div ref={wrapRef} className="admin-clientes-acciones-menu-wrap">
      <button
        type="button"
        className="admin-clientes-menu-btn"
        onClick={onToggle}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Acciones para ${cliente.nombre}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {abierto && (
        <div className="admin-clientes-menu-dropdown" role="menu">
          <button
            type="button"
            className="admin-clientes-menu-opcion"
            role="menuitem"
            onClick={() => elegir(onEditar)}
          >
            Editar
          </button>
          <button
            type="button"
            className="admin-clientes-menu-opcion"
            role="menuitem"
            onClick={() => elegir(onHistorial)}
          >
            Historial
          </button>
          <button
            type="button"
            className="admin-clientes-menu-opcion admin-clientes-menu-opcion--danger"
            role="menuitem"
            disabled={eliminarDisabled}
            title={eliminarTitle}
            onClick={() => elegir(onEliminar)}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
