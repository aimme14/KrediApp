export type AdminRutaStatsData = {
  cajaRuta?: number;
  cajasEmpleados?: number;
  capitalRuta?: number;
  inversiones?: number;
  totalPrestado?: number;
  gastos?: number;
  ganancias?: number;
  perdidas?: number;
};

function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

type AdminRutaStatsGridProps = {
  ruta: AdminRutaStatsData;
  className?: string;
};

/** Tarjetas financieras por ruta (Inicio admin, listado Rutas, etc.). */
export function AdminRutaStatsGrid({ ruta, className }: AdminRutaStatsGridProps) {
  const g = ruta.ganancias ?? 0;
  const gridClass = className
    ? `admin-inicio-ruta-stats ${className}`
    : "admin-inicio-ruta-stats";

  return (
    <div className={gridClass} aria-label="Resumen financiero de la ruta">
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--purple" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Base</span>
          <span className="admin-inicio-ruta-stat-value">{formatMoneda(ruta.cajaRuta ?? 0)}</span>
          <span className="admin-inicio-ruta-stat-hint">caja en ruta</span>
        </div>
      </div>
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--blue" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Caja empleado</span>
          <span className="admin-inicio-ruta-stat-value">{formatMoneda(ruta.cajasEmpleados ?? 0)}</span>
          <span className="admin-inicio-ruta-stat-hint">acumulado</span>
        </div>
      </div>
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--violet" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Capital</span>
          <span className="admin-inicio-ruta-stat-value">{formatMoneda(ruta.capitalRuta ?? 0)}</span>
          <span className="admin-inicio-ruta-stat-hint">total ruta</span>
        </div>
      </div>
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--orange" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Inversiones</span>
          <span className="admin-inicio-ruta-stat-value">{formatMoneda(ruta.inversiones ?? 0)}</span>
          <span className="admin-inicio-ruta-stat-hint">acumulado</span>
        </div>
      </div>
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--blue" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Total invertido</span>
          <span className="admin-inicio-ruta-stat-value">{formatMoneda(ruta.totalPrestado ?? 0)}</span>
          <span className="admin-inicio-ruta-stat-hint">periodo actual</span>
        </div>
      </div>
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--amber" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3h18v4H3z" />
            <path d="M8 7v14" />
            <path d="M16 7v14" />
            <path d="M5 21h14" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Gastos</span>
          <span
            className={`admin-inicio-ruta-stat-value ${
              (ruta.gastos ?? 0) > 0 ? "admin-inicio-ruta-stat-value--neg" : ""
            }`}
          >
            {formatMoneda(ruta.gastos ?? 0)}
          </span>
          <span className="admin-inicio-ruta-stat-hint">periodo actual</span>
        </div>
      </div>
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--green" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Ganancias</span>
          <span
            className={`admin-inicio-ruta-stat-value ${
              g < 0 ? "admin-inicio-ruta-stat-value--neg" : g > 0 ? "admin-inicio-ruta-stat-value--pos" : ""
            }`}
          >
            {formatMoneda(g)}
          </span>
          <span className="admin-inicio-ruta-stat-hint">registradas</span>
        </div>
      </div>
      <div className="admin-inicio-ruta-stat">
        <span className="admin-inicio-ruta-stat-icon admin-inicio-metric-icon--red" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <div className="admin-inicio-ruta-stat-body">
          <span className="admin-inicio-ruta-stat-label">Pérdidas</span>
          <span
            className={`admin-inicio-ruta-stat-value ${
              (ruta.perdidas ?? 0) > 0 ? "admin-inicio-ruta-stat-value--neg" : ""
            }`}
          >
            {formatMoneda(ruta.perdidas ?? 0)}
          </span>
          <span className="admin-inicio-ruta-stat-hint">acumulado</span>
        </div>
      </div>
    </div>
  );
}
