import { fechaDiaCalendarioDesdeISO } from "@/lib/colombia-day-bounds";

/** Ventana desde el día del cobro para encontrar el reporte que lo cerró. */
export const VENTANA_MS_REPORTES_ANULACION = 365 * 24 * 60 * 60 * 1000;

const ROLES_PANEL_ADMIN = new Set(["admin", "adminEmpresa", "jefe"]);
const ROLES_TRABAJADOR = new Set(["empleado", "trabajador"]);

export type RangoReporteAceptado = {
  empleadoId: string;
  rutaId: string;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  fechaDia: string | null;
};

export function esCobroDeTrabajador(params: {
  cobradoPorRol?: string | null;
  empleadoId?: string | null;
  adminUid?: string | null;
}): boolean {
  const rol = (params.cobradoPorRol ?? "").trim();
  if (ROLES_PANEL_ADMIN.has(rol)) return false;
  if (ROLES_TRABAJADOR.has(rol)) return true;
  const empleadoId = (params.empleadoId ?? "").trim();
  const adminUid = (params.adminUid ?? "").trim();
  if (!empleadoId) return false;
  if (adminUid && empleadoId === adminUid) return false;
  return true;
}

function fechaDesdeValorReporte(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export function mapRangoReporteAceptado(data: Record<string, unknown>): RangoReporteAceptado {
  return {
    empleadoId: typeof data.empleadoId === "string" ? data.empleadoId.trim() : "",
    rutaId: typeof data.rutaId === "string" ? data.rutaId.trim() : "",
    fechaDesde: fechaDesdeValorReporte(data.fechaDesde),
    fechaHasta: fechaDesdeValorReporte(data.fechaHasta),
    fechaDia: typeof data.fechaDia === "string" ? data.fechaDia : null,
  };
}

function reporteCorrespondeAlCobro(
  reporte: RangoReporteAceptado,
  filtro?: { empleadoId?: string | null; rutaId?: string | null }
): boolean {
  const empleadoId = (filtro?.empleadoId ?? "").trim();
  const rutaId = (filtro?.rutaId ?? "").trim();
  if (empleadoId && reporte.empleadoId && reporte.empleadoId !== empleadoId) return false;
  if (rutaId && reporte.rutaId && reporte.rutaId !== rutaId) return false;
  return true;
}

/** El cobro cae en el periodo de un reporte ya aceptado (o, si el reporte es viejo, en su fechaDia). */
export function pagoCaeEnReporteAceptado(
  fechaPago: Date,
  reportes: RangoReporteAceptado[],
  filtro?: { empleadoId?: string | null; rutaId?: string | null }
): boolean {
  const t = fechaPago.getTime();
  if (!Number.isFinite(t)) return false;
  const fechaDiaPago = fechaDiaCalendarioDesdeISO(fechaPago.toISOString());

  for (const reporte of reportes) {
    if (!reporteCorrespondeAlCobro(reporte, filtro)) continue;
    const desde = reporte.fechaDesde?.getTime();
    const hasta = reporte.fechaHasta?.getTime();
    const tieneRango =
      typeof desde === "number" &&
      Number.isFinite(desde) &&
      typeof hasta === "number" &&
      Number.isFinite(hasta);
    if (tieneRango) {
      if (t >= desde && t <= hasta) return true;
      continue;
    }
    if (reporte.fechaDia && fechaDiaPago && reporte.fechaDia === fechaDiaPago) return true;
  }
  return false;
}

export function cobroBloqueadoPorReporteAceptado(params: {
  cobradoPorRol?: string | null;
  empleadoId?: string | null;
  rutaId?: string | null;
  adminUid?: string | null;
  fechaPago: Date | null;
  reportes: RangoReporteAceptado[];
}): boolean {
  if (!params.fechaPago) return false;
  if (
    !esCobroDeTrabajador({
      cobradoPorRol: params.cobradoPorRol,
      empleadoId: params.empleadoId,
      adminUid: params.adminUid,
    })
  ) {
    return false;
  }
  return pagoCaeEnReporteAceptado(params.fechaPago, params.reportes, {
    empleadoId: params.empleadoId,
    rutaId: params.rutaId,
  });
}
