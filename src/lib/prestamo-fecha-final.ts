/**
 * Fecha final del préstamo (informativa): campo manual `fechaFinal` (YYYY-MM-DD)
 * con fallback de lectura a `fechaVencimiento` legado.
 * `diasCobroModo` controla la sugerencia y el ritmo (5 = lun–vie · 6 = lun–sáb).
 * El ritmo se calcula en días laborables (sin festivos): los días no laborables
 * no penalizan al cliente.
 */
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
  parseFechaDiaColombia,
} from "@/lib/colombia-day-bounds";
import {
  addWorkingDays,
  getFollowingWorkingDay,
  getNextWorkingDay,
  isWorkingDay,
  toDateKey,
  type DiasLaborablesSemana,
} from "@/lib/fechas-laborables";
import type { DiasCobroModo, ModalidadPago } from "@/types/firestore";

export type PrestamoFechaFinalFields = {
  fechaFinal?: unknown;
  fechaVencimiento?: unknown;
};

/** Sin festivos: el ritmo y la fecha final solo consideran días laborables (lun–vie / lun–sáb). */
const SIN_FESTIVOS: string[] = [];

/** Default productivo: mismo comportamiento histórico (lun–sáb). */
export const DIAS_COBRO_MODO_DEFAULT: DiasCobroModo = "6";

export const DIAS_COBRO_MODO_OPTIONS: {
  value: DiasCobroModo;
  label: string;
  hint: string;
}[] = [
  { value: "6", label: "6 días (lun–sáb)", hint: "" },
  { value: "5", label: "5 días (lun–vie)", hint: "" },
];

export function parseDiasCobroModo(value: unknown): DiasCobroModo | null {
  if (value === "5" || value === "6") return value;
  return null;
}

/**
 * Normaliza modo al crear. Si no viene → default "6" (no rompe clientes que aún no envían el campo).
 * Si viene inválido → error.
 */
export function resolveDiasCobroModoForCreate(
  value: unknown
): { ok: true; modo: DiasCobroModo } | { ok: false; error: string } {
  if (value == null || value === "") {
    return { ok: true, modo: DIAS_COBRO_MODO_DEFAULT };
  }
  const parsed = parseDiasCobroModo(value);
  if (!parsed) {
    return { ok: false, error: "Modo de días de cobro inválido (use 5 o 6)" };
  }
  return { ok: true, modo: parsed };
}

function diasLaborablesFromModo(modo: DiasCobroModo): DiasLaborablesSemana {
  return modo === "5" ? 5 : 6;
}

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
 * Sugerencia de fecha final según modalidad + cuotas + modo de días de cobro.
 * "5" = lun–vie · "6" = lun–sáb. Sin festivos (solo días laborables).
 *
 * En diario: la 1.ª cuota es el **próximo** día hábil tras la fecha de inicio
 * (el día del desembolso no cuenta). `addWorkingDays(primer, N)` devuelve el
 * N-ésimo día hábil contando `primer` como el 1 (incluye el inicio del conteo).
 */
export function sugerirFechaFinalYmd(
  modalidad: ModalidadPago | string,
  fechaInicioYmd: string,
  numeroCuotas: number,
  diasCobroModo: DiasCobroModo = DIAS_COBRO_MODO_DEFAULT
): string | null {
  const laborables = diasLaborablesFromModo(diasCobroModo);

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
    const primerDiaCobro = getFollowingWorkingDay(inicio, SIN_FESTIVOS, laborables);
    // N cuotas = N-ésimo día hábil desde el primero (addWorkingDays cuenta el inicio)
    fin = addWorkingDays(primerDiaCobro, numeroCuotas, SIN_FESTIVOS, laborables);
  } else if (mod === "semanal") {
    const primerDiaCobro = getFollowingWorkingDay(inicio, SIN_FESTIVOS, laborables);
    const ultimaCuotaCalendar = addDays(primerDiaCobro, (numeroCuotas - 1) * 7);
    fin = getNextWorkingDay(ultimaCuotaCalendar, SIN_FESTIVOS, laborables);
  } else {
    const ultimaCuotaCalendar = addMonths(inicio, numeroCuotas - 1);
    fin = getNextWorkingDay(ultimaCuotaCalendar, SIN_FESTIVOS, laborables);
  }
  return ymdFromDateLocal(fin);
}

function dateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const out = new Date(y, m - 1, d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Cuenta días laborables en el rango (desde, hasta] — `desde` exclusivo,
 * `hasta` inclusive. Sin festivos. Devuelve 0 si `hasta` <= `desde`.
 */
function contarDiasLaborables(
  desdeYmdExclusivo: string,
  hastaYmdInclusivo: string,
  laborables: DiasLaborablesSemana
): number | null {
  if (
    !parseFechaDiaColombia(desdeYmdExclusivo).ok ||
    !parseFechaDiaColombia(hastaYmdInclusivo).ok
  ) {
    return null;
  }
  const hasta = dateFromYmd(hastaYmdInclusivo);
  const cur = dateFromYmd(desdeYmdExclusivo);
  cur.setDate(cur.getDate() + 1);
  let count = 0;
  while (cur.getTime() <= hasta.getTime()) {
    if (isWorkingDay(cur, SIN_FESTIVOS, laborables)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export type RitmoEstadoPago = "atrasado" | "al_dia" | "adelantado";

export type RitmoFechaFinalInfo = {
  fechaFinalYmd: string;
  /** YYYY-MM-DD de inicio usado en el cálculo (si existe). */
  fechaInicioYmd: string | null;
  diasRestantes: number;
  /** null si no se puede calcular el ritmo */
  ritmo: RitmoEstadoPago | null;
  /**
   * Solo si ritmo === "adelantado": monto cobrado por encima de lo esperado
   * según el % de tiempo transcurrido.
   */
  montoAdelantado: number;
  /**
   * Cuotas que debería llevar pagadas según el tiempo del plazo, menos las
   * ya cubiertas por saldo. 0 si va al día o adelantado.
   */
  cuotasAtrasadas: number;
};

/**
 * Métricas informativas para la UI de cobro.
 * Ritmo / atraso: compara % pagado (por saldo) vs % de **tiempo laborable** del
 * plazo. Los días no laborables (domingo en modo "6"; sábado y domingo en modo
 * "5") no cuentan, por lo que no penalizan al cliente ni marcan atraso.
 * `diasRestantes` también se cuenta en días laborables (negativo si venció).
 */
export function calcularRitmoFechaFinal(params: {
  fechaFinalYmd: string;
  fechaInicioYmd: string | null;
  numeroCuotas: number;
  cuotasPendientes: number;
  totalAPagar?: number;
  saldoPendiente?: number;
  hoyYmd?: string;
  diasCobroModo?: DiasCobroModo;
}): RitmoFechaFinalInfo | null {
  const fechaFinalYmd = params.fechaFinalYmd.trim().slice(0, 10);
  if (!parseFechaDiaColombia(fechaFinalYmd).ok) return null;

  const laborables = diasLaborablesFromModo(
    params.diasCobroModo ?? DIAS_COBRO_MODO_DEFAULT
  );
  const hoy = params.hoyYmd ?? fechaDiaColombiaHoy();
  if (!parseFechaDiaColombia(hoy).ok) return null;

  // Días laborables restantes (positivo). Si ya venció, negativo.
  const diasRestantes =
    fechaFinalYmd >= hoy
      ? (contarDiasLaborables(hoy, fechaFinalYmd, laborables) ?? 0)
      : -(contarDiasLaborables(fechaFinalYmd, hoy, laborables) ?? 0);

  const inicio = params.fechaInicioYmd?.trim().slice(0, 10) ?? null;
  let ritmo: RitmoEstadoPago | null = null;
  let montoAdelantado = 0;
  let cuotasAtrasadas = 0;

  if (inicio && parseFechaDiaColombia(inicio).ok) {
    const totalDias = contarDiasLaborables(inicio, fechaFinalYmd, laborables);
    // Tiempo transcurrido en días laborables, tope en la fecha final.
    const hoyTope = hoy < fechaFinalYmd ? hoy : fechaFinalYmd;
    const diasTranscurridos = contarDiasLaborables(inicio, hoyTope, laborables);
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
      const epsilon = 1 / (numeroCuotas * 2); // ~media cuota

      // Cuotas que el calendario “espera” pagadas a esta altura del plazo
      const cuotasEsperadas = Math.min(
        numeroCuotas,
        Math.floor(progresoPorTiempo * numeroCuotas + 1e-9)
      );
      cuotasAtrasadas = Math.max(0, cuotasEsperadas - cuotasPagadas);

      if (progresoEnCuotas > progresoPorTiempo + epsilon) {
        ritmo = "adelantado";
        cuotasAtrasadas = 0;
        const total =
          typeof params.totalAPagar === "number" && params.totalAPagar > 0
            ? params.totalAPagar
            : 0;
        const saldo =
          typeof params.saldoPendiente === "number" && Number.isFinite(params.saldoPendiente)
            ? Math.max(0, params.saldoPendiente)
            : total;
        if (total > 0) {
          const cobrado = Math.max(0, total - saldo);
          const esperado = progresoPorTiempo * total;
          montoAdelantado = Math.round(Math.max(0, cobrado - esperado) * 100) / 100;
        }
      } else if (progresoEnCuotas < progresoPorTiempo - epsilon) {
        ritmo = "atrasado";
      } else {
        ritmo = "al_dia";
        cuotasAtrasadas = 0;
      }
    }
  }

  return {
    fechaFinalYmd,
    fechaInicioYmd: inicio && parseFechaDiaColombia(inicio).ok ? inicio : null,
    diasRestantes,
    ritmo,
    montoAdelantado,
    cuotasAtrasadas,
  };
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

export function labelDiasCobroModo(modo: DiasCobroModo | null | undefined): string {
  if (modo === "5") return "5 días (lun–vie)";
  if (modo === "6") return "6 días (lun–sáb)";
  return "—";
}
