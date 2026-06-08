import type { GastosPeriodoVista } from "@/lib/gastos-periodo-filter";

type GastosPeriodoFilterProps = {
  value: GastosPeriodoVista;
  onChange: (vista: GastosPeriodoVista) => void;
  className?: string;
};

const OPCIONES: { id: GastosPeriodoVista; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "historial", label: "Historial" },
];

/** Selector Hoy / Historial para listados de gastos operativos. */
export function GastosPeriodoFilter({ value, onChange, className }: GastosPeriodoFilterProps) {
  const rootClass = className ? `gastos-periodo-filter ${className}` : "gastos-periodo-filter";

  return (
    <div className={rootClass} role="group" aria-label="Filtrar gastos por período">
      {OPCIONES.map((op) => (
        <button
          key={op.id}
          type="button"
          className={`gastos-periodo-btn ${value === op.id ? "gastos-periodo-btn-active" : ""}`}
          onClick={() => onChange(op.id)}
          aria-pressed={value === op.id}
        >
          {op.label}
        </button>
      ))}
    </div>
  );
}

export function mensajeGastosVaciosPeriodo(
  vista: GastosPeriodoVista,
  conBusqueda: boolean
): string {
  if (conBusqueda) return "No hay gastos que coincidan con la búsqueda.";
  if (vista === "hoy") return "No hay gastos registrados hoy.";
  return "No hay gastos en el historial.";
}
