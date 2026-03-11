/**
 * Utilidades para fechas laborables: lunes a sábado.
 * Los domingos y los festivos no se trabajan (no hay cobro).
 * La fecha de "fin previsto" del préstamo se calcula solo con días laborables.
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

/** Festivos: array de fechas en formato "YYYY-MM-DD". Añadir según calendario (país/región). */
export const FESTIVOS: string[] = [
  // Ejemplo: "2025-01-01", "2025-12-25". Dejar vacío para solo excluir domingos.
];

export function isHoliday(d: Date, holidays: string[]): boolean {
  return holidays.includes(toDateKey(d));
}

/** True si es día laborable (lun-sáb y no festivo) */
export function isWorkingDay(d: Date, holidays: string[]): boolean {
  return !isSunday(d) && !isHoliday(d, holidays);
}

/** Devuelve el mismo día si es laborable, o el siguiente día laborable */
export function getNextWorkingDay(d: Date, holidays: string[]): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  while (!isWorkingDay(out, holidays)) {
    out.setDate(out.getDate() + 1);
  }
  return out;
}

/** Suma n días laborables (lun-sáb, sin festivos) a la fecha */
export function addWorkingDays(start: Date, n: number, holidays: string[]): Date {
  if (n <= 0) return new Date(start);
  const out = new Date(start);
  out.setHours(0, 0, 0, 0);
  let count = 0;
  while (count < n) {
    if (isWorkingDay(out, holidays)) count++;
    if (count < n) out.setDate(out.getDate() + 1);
  }
  return out;
}
