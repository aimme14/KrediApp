/**
 * Utilidades para fechas laborables.
 * Por defecto: lunes a sábado (6 días). Opcional: lunes a viernes (5 días).
 * Los festivos (lista YYYY-MM-DD) tampoco cuentan como laborables.
 */

/** Clave YYYY-MM-DD para comparar fechas sin hora */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSunday(d: Date): boolean {
  return d.getDay() === 0;
}

export function isSaturday(d: Date): boolean {
  return d.getDay() === 6;
}

/** 6 = lun–sáb (default histórico); 5 = lun–vie */
export type DiasLaborablesSemana = 5 | 6;

/** Festivos: array de fechas en formato "YYYY-MM-DD". Añadir según calendario (país/región). */
export const FESTIVOS: string[] = [
  // Ejemplo: "2025-01-01", "2025-12-25". Dejar vacío para solo excluir fines no laborables.
];

export function isHoliday(d: Date, holidays: string[]): boolean {
  return holidays.includes(toDateKey(d));
}

/**
 * True si es día laborable según la semana configurada y no es festivo.
 * Default 6 = lun–sáb (compatibilidad con comportamiento previo).
 */
export function isWorkingDay(
  d: Date,
  holidays: string[],
  diasLaborables: DiasLaborablesSemana = 6
): boolean {
  if (isSunday(d)) return false;
  if (diasLaborables === 5 && isSaturday(d)) return false;
  return !isHoliday(d, holidays);
}

/** Devuelve el mismo día si es laborable, o el siguiente día laborable */
export function getNextWorkingDay(
  d: Date,
  holidays: string[],
  diasLaborables: DiasLaborablesSemana = 6
): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  while (!isWorkingDay(out, holidays, diasLaborables)) {
    out.setDate(out.getDate() + 1);
  }
  return out;
}

/**
 * Primer día hábil **después** de `d` (nunca incluye `d`, aunque sea laborable).
 * Útil para cobro: el desembolso no cuenta como día de cuota.
 */
export function getFollowingWorkingDay(
  d: Date,
  holidays: string[],
  diasLaborables: DiasLaborablesSemana = 6
): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() + 1);
  return getNextWorkingDay(out, holidays, diasLaborables);
}

/** Suma n días laborables a la fecha */
export function addWorkingDays(
  start: Date,
  n: number,
  holidays: string[],
  diasLaborables: DiasLaborablesSemana = 6
): Date {
  if (n <= 0) return new Date(start);
  const out = new Date(start);
  out.setHours(0, 0, 0, 0);
  let count = 0;
  while (count < n) {
    if (isWorkingDay(out, holidays, diasLaborables)) count++;
    if (count < n) out.setDate(out.getDate() + 1);
  }
  return out;
}
