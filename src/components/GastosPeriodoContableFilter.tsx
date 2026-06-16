import type { PeriodoAdminListaItem } from "@/lib/empresa-api";
import {
  numeroPeriodoAdmin,
  periodosCerradosAdmin,
  type GastosFiltroContable,
} from "@/lib/gastos-periodo-filter";

type GastosPeriodoContableFilterProps = {
  filtro: GastosFiltroContable;
  onChange: (filtro: GastosFiltroContable) => void;
  periodos: PeriodoAdminListaItem[];
  className?: string;
};

const MODOS: {
  id: GastosFiltroContable["modo"];
  label: string;
  shortLabel: string;
}[] = [
  { id: "hoy", label: "Hoy", shortLabel: "Hoy" },
  { id: "actual", label: "Periodo actual", shortLabel: "Actual" },
  { id: "cerrado", label: "Periodo cerrado", shortLabel: "Cerrado" },
  { id: "todo", label: "Todo el historial", shortLabel: "Historial" },
];

function fmtFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Selector de periodo contable para listados de gastos del administrador. */
export function GastosPeriodoContableFilter({
  filtro,
  onChange,
  periodos,
  className,
}: GastosPeriodoContableFilterProps) {
  const cerrados = periodosCerradosAdmin(periodos);
  const rootClass = className
    ? `gastos-periodo-contable ${className}`
    : "gastos-periodo-contable";

  return (
    <div className={rootClass}>
      <p className="gastos-periodo-contable-legend">Periodo contable</p>
      <div className="gastos-periodo-contable-row">
        <div
          className="gastos-periodo-filter"
          role="group"
          aria-label="Filtrar por periodo contable"
        >
          {MODOS.map((op) => (
            <button
              key={op.id}
              type="button"
              className={`gastos-periodo-btn ${filtro.modo === op.id ? "gastos-periodo-btn-active" : ""}`}
              onClick={() => {
                if (op.id === "cerrado") {
                  const first = cerrados[0];
                  onChange(
                    first ? { modo: "cerrado", periodoId: first.id } : { modo: "cerrado", periodoId: "" }
                  );
                  return;
                }
                onChange({ modo: op.id });
              }}
              aria-pressed={filtro.modo === op.id}
              aria-label={op.label}
            >
              <span className="gastos-periodo-btn-text gastos-periodo-btn-text--long">{op.label}</span>
              <span className="gastos-periodo-btn-text gastos-periodo-btn-text--short">
                {op.shortLabel}
              </span>
            </button>
          ))}
        </div>

        {filtro.modo === "cerrado" && (
          <div className="gastos-periodo-contable-select-wrap">
            {cerrados.length === 0 ? (
              <p className="gastos-periodo-contable-hint">No hay periodos cerrados.</p>
            ) : (
              <>
                <label className="gastos-periodo-contable-select-label" htmlFor="periodo-cerrado-select">
                  Elegir periodo
                </label>
                <select
                  id="periodo-cerrado-select"
                  className="gastos-periodo-contable-select"
                  value={filtro.periodoId}
                  onChange={(e) => onChange({ modo: "cerrado", periodoId: e.target.value })}
                  aria-label="Seleccionar periodo cerrado"
                >
                  {cerrados.map((p) => {
                    const num = numeroPeriodoAdmin(p.id, periodos);
                    return (
                      <option key={p.id} value={p.id}>
                        #{num ?? "—"} · {fmtFechaCorta(p.fechaApertura)} – {fmtFechaCorta(p.fechaCierre)}
                      </option>
                    );
                  })}
                </select>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
