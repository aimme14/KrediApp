"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import type { PrestamoItem, ClienteItem, PeriodoAdminListaItem } from "@/lib/empresa-api";
import type { PrestamoFiltroEstado, PrestamoFiltroContable } from "@/lib/prestamo-periodo-filter";
import { periodoAbiertoAdmin, numeroPeriodoAdmin } from "@/lib/prestamo-periodo-filter";
import { contarParaPreview, generarExcelPrestamos } from "@/lib/export-prestamos";

function formatMoneda(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function esperarPintado(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

type Props = {
  onCerrar: () => void;
  prestamos: PrestamoItem[];
  prestamosPagados: PrestamoItem[];
  prestamosCastigados: PrestamoItem[];
  clientePorId: Record<string, ClienteItem>;
  periodos: PeriodoAdminListaItem[];
  rutas: { id: string; nombre: string }[];
  hayMasPagados: boolean;
  onCargarTodosPagados: () => Promise<void>;
  loadingPagados: boolean;
  nombreEmpresa: string;
  filtrosIniciales?: {
    filtroContable: PrestamoFiltroContable;
    filtroEstado: PrestamoFiltroEstado;
    filtroRutaId: string;
    filtroNombre?: string;
  };
};

const ESTADOS: { value: PrestamoFiltroEstado; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "pagado", label: "Pagados" },
  { value: "castigado", label: "Pérdidas" },
  { value: "moroso", label: "Morosos" },
];

export function ExportPrestamosModal({
  onCerrar,
  prestamos,
  prestamosPagados,
  prestamosCastigados,
  clientePorId,
  periodos,
  rutas,
  hayMasPagados,
  onCargarTodosPagados,
  loadingPagados,
  nombreEmpresa,
  filtrosIniciales,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const periodoAbierto = periodoAbiertoAdmin(periodos);
  const periodosCerrados = periodos.filter((p) => p.estado === "cerrado");

  const [filtroContable, setFiltroContable] = useState<PrestamoFiltroContable>(
    filtrosIniciales?.filtroContable ?? (periodoAbierto ? { modo: "actual" } : { modo: "todo" })
  );
  const [filtroEstado, setFiltroEstado] = useState<PrestamoFiltroEstado>(
    filtrosIniciales?.filtroEstado ?? "todos"
  );
  const [filtroRutaId, setFiltroRutaId] = useState(filtrosIniciales?.filtroRutaId ?? "");
  const [generando, setGenerando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  const necesitaCargarPagados =
    (filtroEstado === "pagado" || filtroEstado === "todos") && hayMasPagados;

  const bloqueado = generando || cargando || necesitaCargarPagados;
  const bloqueadoUi = generando || cargando;

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

  const preview = useMemo(
    () =>
      contarParaPreview({
        prestamos,
        prestamosPagados,
        prestamosCastigados,
        filtroContable,
        filtroEstado,
        filtroRutaId,
        filtroNombre: filtrosIniciales?.filtroNombre,
        clientePorId,
        periodos,
      }),
    [
      prestamos,
      prestamosPagados,
      prestamosCastigados,
      filtroContable,
      filtroEstado,
      filtroRutaId,
      clientePorId,
      periodos,
      filtrosIniciales?.filtroNombre,
    ]
  );

  const handleCargarTodo = async () => {
    setCargando(true);
    try {
      await onCargarTodosPagados();
    } finally {
      setCargando(false);
    }
  };

  const handleDescargar = async () => {
    setErrorExport(null);
    setGenerando(true);
    await esperarPintado();
    try {
      await generarExcelPrestamos({
        prestamos,
        prestamosPagados,
        prestamosCastigados,
        filtroContable,
        filtroEstado,
        filtroRutaId,
        filtroNombre: filtrosIniciales?.filtroNombre,
        clientePorId,
        periodos,
        rutas,
        nombreEmpresa,
      });
      onCerrar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al exportar";
      setErrorExport(msg);
      console.error("[ExportPrestamos excel]", e);
    } finally {
      setGenerando(false);
    }
  };

  const selectValue =
    filtroContable.modo === "cerrado"
      ? `cerrado:${filtroContable.periodoId ?? ""}`
      : filtroContable.modo;

  const modal = (
    <div
      className="export-prestamos-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-prestamos-titulo"
    >
      <button
        type="button"
        className="export-prestamos-backdrop"
        aria-label="Cerrar exportar préstamos"
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
          <h3 id="export-prestamos-titulo" className="export-prestamos-titulo">
            Descargar préstamos
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
            <label htmlFor="export-prestamos-periodo">Período</label>
            <select
              id="export-prestamos-periodo"
              className="export-prestamos-select"
              value={selectValue}
              disabled={bloqueadoUi}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("cerrado:")) {
                  setFiltroContable({ modo: "cerrado", periodoId: v.split(":")[1] });
                } else if (v === "hoy") {
                  setFiltroContable({ modo: "hoy" });
                } else if (v === "actual") {
                  setFiltroContable({ modo: "actual" });
                } else {
                  setFiltroContable({ modo: "todo" });
                }
              }}
            >
              <option value="hoy">Hoy</option>
              {periodoAbierto && (
                <option value="actual">
                  Período actual #{numeroPeriodoAdmin(periodoAbierto.id, periodos) ?? "—"}
                </option>
              )}
              {periodosCerrados.map((p) => (
                <option key={p.id} value={`cerrado:${p.id}`}>
                  Período cerrado #{numeroPeriodoAdmin(p.id, periodos) ?? "—"}
                </option>
              ))}
              <option value="todo">Todo el historial</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="export-prestamos-estado">Estado</label>
            <select
              id="export-prestamos-estado"
              className="export-prestamos-select"
              value={filtroEstado}
              disabled={bloqueadoUi}
              onChange={(e) => setFiltroEstado(e.target.value as PrestamoFiltroEstado)}
            >
              {ESTADOS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="export-prestamos-ruta">Ruta</label>
            <select
              id="export-prestamos-ruta"
              className="export-prestamos-select"
              value={filtroRutaId}
              disabled={bloqueadoUi}
              onChange={(e) => setFiltroRutaId(e.target.value)}
            >
              <option value="">Todas las rutas</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="export-prestamos-preview">
            <p className="export-prestamos-preview-count">
              {preview.cantidad} préstamo{preview.cantidad !== 1 ? "s" : ""} a exportar
            </p>
            <p className="export-prestamos-preview-monto">
              {formatMoneda(preview.totalPrestado)} en desembolsos
            </p>
          </div>

          {necesitaCargarPagados && (
            <div className="export-prestamos-warning" role="status">
              <p className="export-prestamos-warning-title">Historial de pagados incompleto</p>
              <p className="export-prestamos-warning-text">
                Carga el historial completo para que el Excel no tenga omisiones.
              </p>
              <button
                type="button"
                className="btn btn-secondary export-prestamos-warning-btn"
                disabled={cargando || loadingPagados}
                onClick={() => void handleCargarTodo()}
              >
                {cargando || loadingPagados ? "Cargando..." : "Cargar historial completo"}
              </button>
            </div>
          )}

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
            disabled={bloqueado || preview.cantidad === 0}
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
