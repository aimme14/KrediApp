import type { PeriodoAdminListaItem } from "@/lib/empresa-api";
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";

export type GastosPeriodoVista = "hoy" | "historial";

/** Gasto con fecha ISO (o null) registrada en Firestore. */
export type GastoConFecha = { fecha?: string | null };

export type GastoConAlcance = GastoConFecha & {
  monto?: number;
  alcance?: string;
};

export type GastosFiltroContableModo = "hoy" | "actual" | "cerrado" | "todo";

export type GastosFiltroContable =
  | { modo: "hoy" }
  | { modo: "actual" }
  | { modo: "cerrado"; periodoId: string }
  | { modo: "todo" };

export type RangoPeriodoContable = {
  desde: Date;
  hasta: Date;
  periodo: PeriodoAdminListaItem | null;
  numeroPeriodo: number | null;
};

export type TotalesGastosAlcance = {
  admin: number;
  ruta: number;
  empleado: number;
  total: number;
};

/** True si el gasto pertenece al día calendario actual en Colombia. */
export function esGastoDelDiaColombia(
  fechaIso: string | null | undefined,
  hoy: string = fechaDiaColombiaHoy()
): boolean {
  const dia = fechaDiaCalendarioDesdeISO(fechaIso);
  return dia !== null && dia === hoy;
}

/** Separa gastos del día actual (Bogotá) del resto del historial. */
export function filtrarGastosPorPeriodo<T extends GastoConFecha>(
  gastos: T[],
  vista: GastosPeriodoVista,
  hoy: string = fechaDiaColombiaHoy()
): T[] {
  if (vista === "hoy") {
    return gastos.filter((g) => esGastoDelDiaColombia(g.fecha, hoy));
  }
  return gastos.filter((g) => !esGastoDelDiaColombia(g.fecha, hoy));
}

function ymdColombia(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function fechaDesdeIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Misma regla que el cierre contable: incluye gastos cuya fecha cae en el rango,
 * con tolerancia para registros al inicio del día Colombia.
 */
export function gastoOcurreEnRangoContable(
  fechaIso: string | null | undefined,
  desde: Date,
  hasta: Date
): boolean {
  const fechaGasto = fechaDesdeIso(fechaIso);
  if (!fechaGasto) return false;

  const desdeMs = desde.getTime();
  const hastaMs = hasta.getTime();
  const t = fechaGasto.getTime();

  if (t >= desdeMs && t <= hastaMs) return true;

  const ymd = ymdColombia(fechaGasto);
  const dayStart = inicioDiaColombiaUtc(ymd);
  const dayEnd = finDiaColombiaUtc(ymd);
  if (!dayStart || !dayEnd) return false;

  if (Math.abs(t - dayStart.getTime()) <= 1000) {
    return dayEnd.getTime() >= desdeMs && dayStart.getTime() <= hastaMs;
  }

  return false;
}

export function filtrarGastosPorRangoContable<T extends GastoConFecha>(
  gastos: T[],
  desde: Date,
  hasta: Date
): T[] {
  return gastos.filter((g) => gastoOcurreEnRangoContable(g.fecha, desde, hasta));
}

/** Número de periodo para UI (#1 = más antiguo en la lista recibida). */
export function numeroPeriodoAdmin(
  periodoId: string,
  periodos: PeriodoAdminListaItem[]
): number | null {
  const idx = periodos.findIndex((p) => p.id === periodoId);
  if (idx < 0) return null;
  return periodos.length - idx;
}

export function periodoAbiertoAdmin(
  periodos: PeriodoAdminListaItem[]
): PeriodoAdminListaItem | null {
  return periodos.find((p) => p.estado === "abierto") ?? null;
}

export function periodosCerradosAdmin(
  periodos: PeriodoAdminListaItem[]
): PeriodoAdminListaItem[] {
  return periodos.filter((p) => p.estado === "cerrado");
}

/** Resuelve el rango de fechas del filtro contable. `null` en modo todo o sin periodo aplicable. */
export function resolverRangoFiltroContable(
  filtro: GastosFiltroContable,
  periodos: PeriodoAdminListaItem[],
  ahora: Date = new Date()
): RangoPeriodoContable | null {
  if (filtro.modo === "todo" || filtro.modo === "hoy") return null;

  if (filtro.modo === "actual") {
    const abierto = periodoAbiertoAdmin(periodos);
    if (!abierto?.fechaApertura) return null;
    const desde = fechaDesdeIso(abierto.fechaApertura);
    if (!desde) return null;
    return {
      desde,
      hasta: ahora,
      periodo: abierto,
      numeroPeriodo: numeroPeriodoAdmin(abierto.id, periodos),
    };
  }

  const periodo = periodos.find((p) => p.id === filtro.periodoId);
  if (!periodo?.fechaApertura) return null;
  const desde = fechaDesdeIso(periodo.fechaApertura);
  if (!desde) return null;
  const hasta = periodo.fechaCierre ? fechaDesdeIso(periodo.fechaCierre) ?? ahora : ahora;

  return {
    desde,
    hasta,
    periodo,
    numeroPeriodo: numeroPeriodoAdmin(periodo.id, periodos),
  };
}

export function filtrarGastosPorFiltroContable<T extends GastoConFecha>(
  gastos: T[],
  filtro: GastosFiltroContable,
  periodos: PeriodoAdminListaItem[],
  ahora: Date = new Date(),
  hoy: string = fechaDiaColombiaHoy()
): T[] {
  if (filtro.modo === "todo") return gastos;
  if (filtro.modo === "hoy") {
    return gastos.filter((g) => esGastoDelDiaColombia(g.fecha, hoy));
  }
  const rango = resolverRangoFiltroContable(filtro, periodos, ahora);
  if (!rango) return [];
  return filtrarGastosPorRangoContable(gastos, rango.desde, rango.hasta);
}

export function calcularTotalesGastosPorAlcance(
  gastos: GastoConAlcance[]
): TotalesGastosAlcance {
  return gastos.reduce(
    (acc, g) => {
      const monto = typeof g.monto === "number" ? g.monto : 0;
      const alcance = (g.alcance ?? "").trim();
      if (alcance === "empleado") acc.empleado = round2(acc.empleado + monto);
      else if (alcance === "ruta") acc.ruta = round2(acc.ruta + monto);
      else acc.admin = round2(acc.admin + monto);
      acc.total = round2(acc.total + monto);
      return acc;
    },
    { admin: 0, ruta: 0, empleado: 0, total: 0 }
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mensajeGastosVaciosContable(
  filtro: GastosFiltroContable,
  periodos: PeriodoAdminListaItem[],
  conBusqueda: boolean
): string {
  if (conBusqueda) return "No hay gastos que coincidan con la búsqueda.";
  if (filtro.modo === "hoy") return "No hay gastos registrados hoy.";
  if (filtro.modo === "todo") return "No hay gastos registrados.";
  if (filtro.modo === "actual" && !periodoAbiertoAdmin(periodos)) {
    return "No hay periodo abierto. Abre un periodo en Resumen económico para ver los gastos del corte actual.";
  }
  if (filtro.modo === "cerrado") {
    return "No hay gastos en el periodo seleccionado.";
  }
  return "No hay gastos en el periodo actual.";
}
