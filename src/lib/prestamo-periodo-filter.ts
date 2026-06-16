/**
 * Filtro de periodo contable para préstamos (fecha de creación / desembolso).
 * Reutiliza la misma lógica de rangos que gastos y resumen económico.
 */

import type { PeriodoAdminListaItem } from "@/lib/empresa-api";
import {
  esGastoDelDiaColombia,
  filtrarGastosPorFiltroContable,
  gastoOcurreEnRangoContable,
  numeroPeriodoAdmin,
  periodoAbiertoAdmin,
  resolverRangoFiltroContable,
  type GastosFiltroContable,
} from "@/lib/gastos-periodo-filter";
import {
  fechaCreacionPrestamoIso,
  type PrestamoFechaCreacion,
} from "@/lib/prestamo-display";

export type PrestamoFiltroContable = GastosFiltroContable;

export type PrestamoFiltroEstado = "todos" | "activo" | "pagado" | "moroso";

export type PrestamoConFechaCreacion = PrestamoFechaCreacion;

export { numeroPeriodoAdmin, periodoAbiertoAdmin, resolverRangoFiltroContable };

export function fechaPrestamoParaFiltroPeriodo(
  p: PrestamoConFechaCreacion
): string | null {
  return fechaCreacionPrestamoIso(p);
}

export function prestamoOcurreEnFiltroContable(
  p: PrestamoConFechaCreacion,
  filtro: PrestamoFiltroContable,
  periodos: PeriodoAdminListaItem[],
  ahora: Date = new Date(),
  hoy?: string
): boolean {
  const fecha = fechaPrestamoParaFiltroPeriodo(p);
  if (filtro.modo === "todo") return true;
  if (filtro.modo === "hoy") return esGastoDelDiaColombia(fecha, hoy);
  const rango = resolverRangoFiltroContable(filtro, periodos, ahora);
  if (!rango) return false;
  return gastoOcurreEnRangoContable(fecha, rango.desde, rango.hasta);
}

export function filtrarPrestamosPorFiltroContable<T extends PrestamoConFechaCreacion>(
  prestamos: T[],
  filtro: PrestamoFiltroContable,
  periodos: PeriodoAdminListaItem[],
  ahora: Date = new Date(),
  hoy?: string
): T[] {
  return filtrarGastosPorFiltroContable(
    prestamos.map((p) => ({ ...p, fecha: fechaPrestamoParaFiltroPeriodo(p) })),
    filtro,
    periodos,
    ahora,
    hoy
  );
}

export function mensajePrestamosVaciosContable(
  filtro: PrestamoFiltroContable,
  periodos: PeriodoAdminListaItem[],
  filtroEstado: PrestamoFiltroEstado,
  conBusqueda: boolean,
  conRuta: boolean
): string {
  if (conBusqueda) return "No hay préstamos que coincidan con la búsqueda.";
  if (conRuta) return "No hay préstamos en la ruta seleccionada con los filtros actuales.";
  if (filtro.modo === "hoy") return "No hay préstamos desembolsados hoy.";
  if (filtro.modo === "actual" && !periodoAbiertoAdmin(periodos)) {
    return "No hay periodo abierto. Abre un periodo en Resumen económico para ver los desembolsos del corte actual.";
  }
  if (filtro.modo === "cerrado") return "No hay préstamos en el periodo seleccionado.";
  if (filtroEstado === "moroso") {
    return "No hay préstamos activos pendientes de clientes morosos en este filtro.";
  }
  if (filtroEstado === "activo") return "No hay préstamos activos con los filtros actuales.";
  if (filtroEstado === "pagado") return "No hay préstamos pagados con los filtros actuales.";
  if (filtro.modo === "actual") return "No hay préstamos en el periodo actual.";
  return "No hay préstamos con los filtros actuales.";
}
