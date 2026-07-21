/**
 * Helpers puros de fecha de acceso por empresa (seguros en cliente y servidor).
 */

import { fechaDiaColombiaHoy, parseFechaDiaColombia } from "@/lib/colombia-day-bounds";

export type AccesoHastaInput = string | null | undefined;

/**
 * true si llegó el día de pago/corte o ya pasó (hora Colombia).
 * Ejemplo: accesoHasta = 2026-07-10 → el 10 ya está vencido (debe deshabilitar).
 */
export function empresaAccesoVencido(
  accesoHasta: AccesoHastaInput,
  hoyYmd: string = fechaDiaColombiaHoy()
): boolean {
  if (!accesoHasta || typeof accesoHasta !== "string") return false;
  const trimmed = accesoHasta.trim().slice(0, 10);
  if (!parseFechaDiaColombia(trimmed).ok) return false;
  return hoyYmd >= trimmed;
}

/** Días restantes hasta el día de corte (0 si ya venció o es hoy). null si no hay fecha válida. */
export function diasRestantesAccesoEmpresa(
  accesoHasta: AccesoHastaInput,
  hoyYmd: string = fechaDiaColombiaHoy()
): number | null {
  if (!accesoHasta || typeof accesoHasta !== "string") return null;
  const trimmed = accesoHasta.trim().slice(0, 10);
  if (!parseFechaDiaColombia(trimmed).ok) return null;
  if (hoyYmd >= trimmed) return 0;
  const [y1, m1, d1] = hoyYmd.split("-").map(Number);
  const [y2, m2, d2] = trimmed.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
}

export interface EmpresaAccesoInfo {
  empresaId: string;
  accesoHasta: string | null;
  activa: boolean;
  vencido: boolean;
  diasRestantes: number | null;
}

export function buildEmpresaAccesoInfo(
  empresaId: string,
  data: { accesoHasta?: unknown; activa?: unknown } | undefined,
  hoyYmd: string = fechaDiaColombiaHoy()
): EmpresaAccesoInfo {
  const raw = data?.accesoHasta;
  const accesoHasta =
    typeof raw === "string" && parseFechaDiaColombia(raw.trim().slice(0, 10)).ok
      ? raw.trim().slice(0, 10)
      : null;
  const vencido = empresaAccesoVencido(accesoHasta, hoyYmd);
  return {
    empresaId,
    accesoHasta,
    activa: data?.activa !== false,
    vencido,
    diasRestantes: diasRestantesAccesoEmpresa(accesoHasta, hoyYmd),
  };
}

/** Normaliza input de fecha para guardar en Firestore (null = sin límite). */
export function normalizarAccesoHastaInput(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 10);
  if (!parseFechaDiaColombia(trimmed).ok) return null;
  return trimmed;
}
