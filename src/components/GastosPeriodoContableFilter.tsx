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

const MODOS: { id: GastosFiltroContable["modo"]; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "actual", label: "Periodo actual" },
  { id: "cerrado", label: "Periodo cerrado" },
  { id: "todo", label: "Todo el historial" },
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
      <div className="gastos-periodo-contable-row">
        <div className="gastos-periodo-filter" role="group" aria-label="Filtrar gastos por periodo contable">
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
            >
              {op.label}
            </button>
          ))}
        </div>

        {filtro.modo === "cerrado" && (
          <div className="gastos-periodo-contable-select-wrap">
            {cerrados.length === 0 ? (
              <p className="gastos-periodo-contable-hint">No hay periodos cerrados.</p>
            ) : (
              <select
                className="gastos-periodo-contable-select"
                value={filtro.periodoId}
                onChange={(e) => onChange({ modo: "cerrado", periodoId: e.target.value })}
                aria-label="Seleccionar periodo cerrado"
              >
                {cerrados.map((p) => {
                  const num = numeroPeriodoAdmin(p.id, periodos);
                  return (
                    <option key={p.id} value={p.id}>
                      Periodo #{num ?? "—"} · {fmtFechaCorta(p.fechaApertura)} –{" "}
                      {fmtFechaCorta(p.fechaCierre)}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
