/**
 * Fecha final del préstamo (informativa): campo manual `fechaFinal` (YYYY-MM-DD)
 * con fallback de lectura a `fechaVencimiento` legado.
 */
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
  parseFechaDiaColombia,
} from "@/lib/colombia-day-bounds";
import {
  addWorkingDays,
  FESTIVOS,
  getNextWorkingDay,
  toDateKey,
} from "@/lib/fechas-laborables";
import type { ModalidadPago } from "@/types/firestore";

export type PrestamoFechaFinalFields = {
  fechaFinal?: unknown;
  fechaVencimiento?: unknown;
};

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function ymdFromDateLocal(d: Date): string {
  return toDateKey(d);
}

/**
 * Normaliza Timestamp / Date / ISO / YYYY-MM-DD → YYYY-MM-DD (calendario Colombia cuando aplica).
 */
export function toFechaFinalYmd(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const dayOnly = trimmed.slice(0, 10);
    if (parseFechaDiaColombia(dayOnly).ok) return dayOnly;
    return fechaDiaCalendarioDesdeISO(trimmed);
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return fechaDiaCalendarioDesdeISO(value.toISOString());
  }
  if (typeof value === "object") {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === "function") {
      try {
        const d = withToDate.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) {
          return fechaDiaCalendarioDesdeISO(d.toISOString());
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Punto único de verdad: fechaFinal manual o fechaVencimiento legado. */
export function effectiveFechaFinal(doc: PrestamoFechaFinalFields): string | null {
  return toFechaFinalYmd(doc.fechaFinal) ?? toFechaFinalYmd(doc.fechaVencimiento);
}

/**
 * Valida fechaFinal obligatoria al crear. Debe ser YYYY-MM-DD y >= fechaInicio.
 */
export function validateFechaFinalRequired(
  fechaFinal: unknown,
  fechaInicioYmd: string
): { ok: true; ymd: string } | { ok: false; error: string } {
  if (typeof fechaFinal !== "string" || !fechaFinal.trim()) {
    return { ok: false, error: "La fecha final del préstamo es obligatoria" };
  }
  const ymd = fechaFinal.trim().slice(0, 10);
  if (!parseFechaDiaColombia(ymd).ok) {
    return { ok: false, error: "Fecha final inválida (use YYYY-MM-DD)" };
  }
  // Comprobar que el día existe en el calendario (p.ej. no 2025-02-31)
  const [y, m, d] = ymd.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return { ok: false, error: "Fecha final inválida" };
  }
  const inicio = fechaInicioYmd.trim().slice(0, 10);
  if (parseFechaDiaColombia(inicio).ok && ymd < inicio) {
    return { ok: false, error: "La fecha final no puede ser anterior a la fecha de inicio" };
  }
  return { ok: true, ymd };
}

/**
 * Sugerencia de fecha final según modalidad + cuotas (días laborables).
 * Solo para prefill en formularios — no es el valor definitivo guardado.
 */
export function sugerirFechaFinalYmd(
  modalidad: ModalidadPago | string,
  fechaInicioYmd: string,
  numeroCuotas: number
): string | null {
  const inicioDay = fechaInicioYmd.trim().slice(0, 10);
  if (!parseFechaDiaColombia(inicioDay).ok) return null;
  if (!Number.isFinite(numeroCuotas) || numeroCuotas < 1) return null;

  const [y, m, d] = inicioDay.split("-").map(Number);
  const inicio = new Date(y, m - 1, d);
  inicio.setHours(0, 0, 0, 0);

  const mod: ModalidadPago =
    modalidad === "diario" || modalidad === "semanal" ? modalidad : "mensual";

  let fin: Date;
  if (mod === "diario") {
    const primerDiaCobro = getNextWorkingDay(inicio, FESTIVOS);
    fin = addWorkingDays(primerDiaCobro, numeroCuotas - 1, FESTIVOS);
  } else if (mod === "semanal") {
    const primerDiaCobro = getNextWorkingDay(inicio, FESTIVOS);
    const ultimaCuotaCalendar = addDays(primerDiaCobro, (numeroCuotas - 1) * 7);
    fin = getNextWorkingDay(ultimaCuotaCalendar, FESTIVOS);
  } else {
    const ultimaCuotaCalendar = addMonths(inicio, numeroCuotas - 1);
    fin = getNextWorkingDay(ultimaCuotaCalendar, FESTIVOS);
  }
  return ymdFromDateLocal(fin);
}

function diffDiasCalendario(inicioYmd: string, finYmd: string): number | null {
  if (!parseFechaDiaColombia(inicioYmd).ok || !parseFechaDiaColombia(finYmd).ok) return null;
  const [y1, m1, d1] = inicioYmd.split("-").map(Number);
  const [y2, m2, d2] = finYmd.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export type RitmoFechaFinalInfo = {
  fechaFinalYmd: string;
  diasRestantes: number;
  alDia: boolean | null;
};

/**
 * Métricas informativas para la UI de cobro.
 * `alDia === null` si no se puede calcular el ritmo (totalDias <= 0 o sin cuotas).
 */
export function calcularRitmoFechaFinal(params: {
  fechaFinalYmd: string;
  fechaInicioYmd: string | null;
  numeroCuotas: number;
  cuotasPendientes: number;
  hoyYmd?: string;
}): RitmoFechaFinalInfo | null {
  const fechaFinalYmd = params.fechaFinalYmd.trim().slice(0, 10);
  if (!parseFechaDiaColombia(fechaFinalYmd).ok) return null;

  const hoy = params.hoyYmd ?? fechaDiaColombiaHoy();
  const diasRestantes = diffDiasCalendario(hoy, fechaFinalYmd);
  if (diasRestantes == null) return null;

  const inicio = params.fechaInicioYmd?.trim().slice(0, 10) ?? null;
  let alDia: boolean | null = null;
  if (inicio && parseFechaDiaColombia(inicio).ok) {
    const totalDias = diffDiasCalendario(inicio, fechaFinalYmd);
    const diasTranscurridos = diffDiasCalendario(inicio, hoy);
    const { numeroCuotas, cuotasPendientes } = params;
    if (
      totalDias != null &&
      totalDias > 0 &&
      diasTranscurridos != null &&
      numeroCuotas > 0
    ) {
      const cuotasPagadas = Math.max(
        0,
        Math.min(numeroCuotas, numeroCuotas - cuotasPendientes)
      );
      const progresoPorTiempo = Math.min(1, Math.max(0, diasTranscurridos / totalDias));
      const progresoEnCuotas = cuotasPagadas / numeroCuotas;
      alDia = progresoEnCuotas >= progresoPorTiempo;
    }
  }

  return { fechaFinalYmd, diasRestantes, alDia };
}

/** Formato corto para mostrar (ej. 31 dic 2025). */
export function formatFechaFinalDisplay(ymd: string): string {
  if (!parseFechaDiaColombia(ymd).ok) return ymd;
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
