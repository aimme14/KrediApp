/** Fin del periodo gratuito de la app (inclusive). */
export const FREE_TRIAL_END_DATE = "2026-07-20";

/** Cada cuánto puede mostrarse de nuevo tras cerrarla (12 h ≈ 2 veces al día). */
export const TRIAL_REMINDER_INTERVAL_MS = 12 * 60 * 60 * 1000;

const STORAGE_KEY = "krediapp-trial-reminder-last-dismissed";

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Días restantes hasta el fin del trial (0 si ya pasó). */
export function diasRestantesTrial(hoy = new Date()): number {
  const fin = parseYmd(FREE_TRIAL_END_DATE);
  fin.setHours(23, 59, 59, 999);
  const diff = fin.getTime() - hoy.getTime();
  if (diff < 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function trialAunVigente(hoy = new Date()): boolean {
  return diasRestantesTrial(hoy) > 0;
}

function readLastDismissed(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** True si han pasado al menos 12 h desde el último cierre (o nunca se mostró). */
export function debeMostrarTrialReminder(ahora = Date.now()): boolean {
  if (!trialAunVigente(new Date(ahora))) return false;
  const last = readLastDismissed();
  if (last === null) return true;
  return ahora - last >= TRIAL_REMINDER_INTERVAL_MS;
}

export function registrarCierreTrialReminder(ahora = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(ahora));
  } catch {
    /* localStorage no disponible */
  }
}
