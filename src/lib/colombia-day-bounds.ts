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

/**
 * Convierte YYYY-MM-DD del cliente en el instante de inicio de ese día en Colombia.
 * Evita guardar medianoche UTC (parse de ISO fecha), que al mostrar en zona local aparece como el día anterior.
 */
export function fechaGastoDesdeStringCliente(fecha?: string): Date {
  if (!fecha?.trim()) return new Date();
  const day = fecha.trim().slice(0, 10);
  if (parseFechaDiaColombia(day).ok) {
    return inicioDiaColombiaUtc(day) ?? new Date(day);
  }
  return new Date(fecha);
}

function fechaGuardadaMedianocheUtcPura(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/**
 * Etiqueta de calendario para un gasto: nuevos registros (inicio Bogotá) o legado (medianoche UTC de solo-fecha ISO).
 */
export function formatoFechaGastoColombia(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  const t = d.getTime();
  if (!Number.isFinite(t)) return "—";
  if (fechaGuardadaMedianocheUtcPura(d)) {
    return d.toLocaleDateString("es-CO", { timeZone: "UTC" });
  }
  return d.toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
}

/** YYYY-MM-DD alineado a `formatoFechaGastoColombia` (útil para comparar con fechaDiaColombiaHoy()). */
export function fechaDiaCalendarioDesdeISO(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  if (fechaGuardadaMedianocheUtcPura(d)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return new Date(isoStr)
    .toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
    .slice(0, 10);
}
