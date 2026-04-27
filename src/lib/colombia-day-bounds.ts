/**
 * Límites UTC para un día calendario en Colombia (UTC−5, sin DST).
 * `fechaDia` formato YYYY-MM-DD.
 */

export function parseFechaDiaColombia(fechaDia: string): { ok: true; y: number; m: number; d: number } | { ok: false } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDia)) return { ok: false };
  const [ys, ms, ds] = fechaDia.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return { ok: false };
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false };
  return { ok: true, y, m, d };
}

/** Inicio del día en Colombia → instante UTC (inclusive). */
export function inicioDiaColombiaUtc(fechaDia: string): Date | null {
  const p = parseFechaDiaColombia(fechaDia);
  if (!p.ok) return null;
  const { y, m, d } = p;
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0));
}

/** Fin del día en Colombia → instante UTC (inclusive del último ms del día local). */
export function finDiaColombiaUtc(fechaDia: string): Date | null {
  const start = inicioDiaColombiaUtc(fechaDia);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Fecha calendario actual en America/Bogota (YYYY-MM-DD). */
export function fechaDiaColombiaHoy(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
    .slice(0, 10);
}
