/**
 * Aviso de acceso próximo a vencer: 2 días antes del corte (día de pago).
 * Visible para jefe, admin y adminEmpresa; máximo una vez cada 4 horas.
 */

import type { Role } from "@/types/roles";
import { diasRestantesAccesoEmpresa } from "@/lib/empresa-acceso-fechas";

export const AVISO_ACCESO_ROLES: readonly Role[] = ["jefe", "admin", "adminEmpresa"];

/** Intervalo mínimo entre avisos (4 horas). */
export const AVISO_ACCESO_THROTTLE_MS = 4 * 60 * 60 * 1000;

export const WHATSAPP_PAGO_NUMERO = "573136714966";

export const WHATSAPP_PAGO_URL = `https://wa.me/${WHATSAPP_PAGO_NUMERO}?text=${encodeURIComponent(
  "Hola, ya realicé el pago. Adjunto el comprobante para extender el acceso de mi cuenta."
)}`;

export function esRolAvisoAcceso(role: Role | string | undefined): boolean {
  return role === "jefe" || role === "admin" || role === "adminEmpresa";
}

/**
 * Ventana de aviso: faltan 1 o 2 días (ej. corte el 23 → se muestra el 21 y el 22).
 * El día de corte (0) ya deshabilita; no es aviso.
 */
export function debeMostrarAvisoPorDiasRestantes(diasRestantes: number | null): boolean {
  return diasRestantes === 1 || diasRestantes === 2;
}

export function debeMostrarAvisoAccesoHasta(
  accesoHasta: string | null | undefined,
  hoyYmd?: string
): boolean {
  return debeMostrarAvisoPorDiasRestantes(diasRestantesAccesoEmpresa(accesoHasta, hoyYmd));
}

export function avisoAccesoStorageKey(uid: string): string {
  return `kredi:aviso-acceso-vencimiento:${uid}`;
}

export function puedeMostrarAvisoPorThrottle(
  uid: string,
  nowMs: number = Date.now()
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(avisoAccesoStorageKey(uid));
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return nowMs - last >= AVISO_ACCESO_THROTTLE_MS;
  } catch {
    return true;
  }
}

/** Marca el aviso como visto (inicia el cooldown de 4 horas). */
export function registrarAvisoAccesoVisto(uid: string, nowMs: number = Date.now()): void {
  try {
    window.localStorage.setItem(avisoAccesoStorageKey(uid), String(nowMs));
  } catch {
    /* localStorage no disponible */
  }
}

export function resolverEmpresaIdParaAcceso(profile: {
  uid: string;
  role: Role;
  empresaId?: string;
}): string | null {
  if (profile.role === "jefe" || profile.role === "adminEmpresa") {
    return profile.empresaId?.trim() || profile.uid;
  }
  if (profile.role === "admin") {
    const id = profile.empresaId?.trim();
    return id || null;
  }
  return null;
}
