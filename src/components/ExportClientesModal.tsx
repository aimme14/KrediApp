"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ClienteItem } from "@/lib/empresa-api";
import {
  filtrarClientesParaExport,
  filtroPrestamoDesdeVista,
  generarExcelClientes,
  type VistaExportCliente,
} from "@/lib/export-clientes";

function esperarPintado(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

type Props = {
  onCerrar: () => void;
  clientes: ClienteItem[];
  rutaPorId: Record<string, string>;
  filtroRutaId: string;
  filtroNombre?: string;
  nombreEmpresa: string;
  vistaInicial?: VistaExportCliente;
};

const OPCIONES_VISTA: { value: VistaExportCliente; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "az", label: "A-Z" },
  { value: "si", label: "Con préstamo" },
  { value: "no", label: "Sin préstamo" },
];

export function ExportClientesModal({
  onCerrar,
  clientes,
  rutaPorId,
  filtroRutaId,
  filtroNombre,
  nombreEmpresa,
  vistaInicial = "todos",
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [vistaLista, setVistaLista] = useState<VistaExportCliente>(vistaInicial);
  const [generando, setGenerando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  const bloqueadoUi = generando;
  const filtroPrestamoActivo = filtroPrestamoDesdeVista(vistaLista);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || bloqueadoUi) return;
      onCerrar();
    };
    document.addEventListener("keydown", onEscape);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = prevOverflow;
    };
  }, [bloqueadoUi, onCerrar]);

  const contadores = useMemo(() => {
    const base = filtrarClientesParaExport(clientes, filtroNombre, filtroRutaId, "todos");
    return {
      todos: base.length,
      az: base.length,
      si: base.filter((c) => c.prestamo_activo).length,
      no: base.filter((c) => !c.prestamo_activo).length,
    };
  }, [clientes, filtroNombre, filtroRutaId]);

  const listaExport = useMemo(
    () =>
      filtrarClientesParaExport(
        clientes,
        filtroNombre,
        filtroRutaId,
        filtroPrestamoActivo
      ),
    [clientes, filtroNombre, filtroRutaId, filtroPrestamoActivo]
  );

  const nombreRuta = filtroRutaId ? rutaPorId[filtroRutaId] : undefined;
  const rutaLabel = filtroRutaId && nombreRuta ? nombreRuta : "Todas las rutas";

  const handleDescargar = async () => {
    setErrorExport(null);
    setGenerando(true);
    await esperarPintado();
    try {
      await generarExcelClientes({
        clientes: listaExport,
        rutaPorId,
        vistaLista,
        filtroRutaId,
        filtroNombre,
        nombreEmpresa,
        nombreRuta,
      });
      onCerrar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al exportar";
      setErrorExport(msg);
      console.error("[ExportClientes]", e);
    } finally {
      setGenerando(false);
    }
  };

  const modal = (
    <div
      className="export-prestamos-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-clientes-titulo"
    >
      <button
        type="button"
        className="export-prestamos-backdrop"
        aria-label="Cerrar exportar clientes"
        onClick={() => {
          if (bloqueadoUi) return;
          onCerrar();
        }}
      />
      <div
        className={`export-prestamos-box${generando ? " export-prestamos-box--loading" : ""}`}
        onClick={(e) => e.stopPropagation()}
        aria-busy={generando}
      >
        {generando && (
          <div className="export-prestamos-loading" role="status" aria-live="polite">
            <span className="export-prestamos-spinner" aria-hidden />
            <p className="export-prestamos-loading-text">Cargando Excel…</p>
          </div>
        )}
        <div className="export-prestamos-head">
          <h3 id="export-clientes-titulo" className="export-prestamos-titulo">
            Descargar clientes
          </h3>
          <button
            type="button"
            className="export-prestamos-close"
            onClick={onCerrar}
            disabled={bloqueadoUi}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="export-prestamos-body">
          <div className="form-group">
            <span className="export-prestamos-formato-label" id="export-clientes-vista-label">
              Filtro
            </span>
            <div
              className="prestamo-admin-tabs admin-clientes-filtro-tabs export-clientes-prestamo-tabs"
              role="radiogroup"
              aria-labelledby="export-clientes-vista-label"
            >
              {OPCIONES_VISTA.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={vistaLista === value}
                  className={`prestamo-admin-tab${vistaLista === value ? " prestamo-admin-tab--active" : ""}`}
                  disabled={bloqueadoUi}
                  onClick={() => setVistaLista(value)}
                  aria-label={
                    value === "az"
                      ? "Orden alfabético A-Z"
                      : `${label}, ${contadores[value]} cliente${contadores[value] !== 1 ? "s" : ""}`
                  }
                >
                  {label}
                  {value !== "az" ? (
                    <span className="prestamo-admin-tab-count">({contadores[value]})</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {(filtroRutaId || filtroNombre?.trim()) && (
            <p className="export-prestamos-preview-hint" role="status">
              {filtroNombre?.trim() ? `Búsqueda: «${filtroNombre.trim()}»` : ""}
              {filtroNombre?.trim() && filtroRutaId ? " · " : ""}
              {filtroRutaId ? `Ruta: ${rutaLabel}` : ""}
            </p>
          )}

          <div className="export-prestamos-preview">
            <p className="export-prestamos-preview-count">
              {listaExport.length} cliente{listaExport.length !== 1 ? "s" : ""} a exportar
              {vistaLista === "az" ? " · orden A-Z" : ""}
            </p>
          </div>

          {errorExport && (
            <p className="export-prestamos-error" role="alert">
              {errorExport}
            </p>
          )}
        </div>

        <div className="export-prestamos-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={generando}
            onClick={onCerrar}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary export-prestamos-btn-descargar"
            disabled={generando || listaExport.length === 0}
            aria-busy={generando}
            onClick={() => void handleDescargar()}
          >
            {generando ? (
              <>
                <span className="export-prestamos-spinner export-prestamos-spinner--btn" aria-hidden />
                Cargando…
              </>
            ) : (
              "Descargar Excel"
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
