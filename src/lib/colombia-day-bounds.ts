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

/** YYYY-MM-DD → etiqueta dd/mm/yyyy en calendario Colombia. */
export function formatFechaDia(yyyyMmDd: string): string {
  if (!yyyyMmDd) return "";
  const date = new Date(`${yyyyMmDd}T05:00:00Z`);
  if (Number.isNaN(date.getTime())) return yyyyMmDd;
  return date.toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Fecha calendario actual en America/Bogota (YYYY-MM-DD). */
export function fechaDiaColombiaHoy(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
    .slice(0, 10);
}

const TZ_BOGOTA = "America/Bogota";
/** Corte diario para notificaciones operativas FCM (hora local Colombia, 0–23). */
const HORA_CORTE_NOTIF_OPERATIVA_COL = 23;

function ymdYHoraColombia(instant: Date): { ymd: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BOGOTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hour12: false,
  }).formatToParts(instant);
  const v = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    ymd: `${v("year")}-${v("month")}-${v("day")}`,
    hour: Number(v("hour")),
  };
}

/**
 * Notificación operativa vigente: mismo día calendario en Colombia y antes de las 23:00 hora Colombia.
 */
export function esDiaActualColombia(timestampMs: number): boolean {
  const ts = Number(timestampMs);
  if (!Number.isFinite(ts)) return false;
  const notif = ymdYHoraColombia(new Date(ts));
  const ahora = ymdYHoraColombia(new Date());
  if (notif.ymd !== ahora.ymd) return false;
  if (ahora.hour >= HORA_CORTE_NOTIF_OPERATIVA_COL) return false;
  return true;
}

/**
 * Misma lógica que `esDiaActualColombia`, como fuente JS para el Service Worker FCM.
 * Inyectar en `firebase-messaging-sw.js/route.ts` — no editar a mano el cuerpo duplicado.
 */
export const ES_DIA_ACTUAL_COLOMBIA_SW_SOURCE = `function esDiaActualColombia(timestampMs) {
  var ts = Number(timestampMs);
  if (!Number.isFinite(ts)) return false;
  var TZ = '${TZ_BOGOTA}';
  var CORTE = ${HORA_CORTE_NOTIF_OPERATIVA_COL};
  function ymdYHoraColombia(instant) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(instant);
    var v = function (type) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === type) return parts[i].value;
      }
      return '';
    };
    return {
      ymd: v('year') + '-' + v('month') + '-' + v('day'),
      hour: Number(v('hour')),
    };
  }
  var notif = ymdYHoraColombia(new Date(ts));
  var ahora = ymdYHoraColombia(new Date());
  if (notif.ymd !== ahora.ymd) return false;
  if (ahora.hour >= CORTE) return false;
  return true;
}`;

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
