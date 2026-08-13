import type { PagoHistorialClienteItem } from "@/lib/empresa-api";

/**
 * Caché local (localStorage) del historial de pagos por cliente.
 *
 * Objetivo: si el usuario ya consultó el historial de un cliente, al volver a
 * abrirlo se sirve directamente desde la caché sin ir de nuevo al servidor.
 * El botón "Actualizar" del modal fuerza un refresco y reescribe la caché.
 */

const PREFIX = "kredi:historial:";

/** Vigencia de la caché. Pasado este tiempo se vuelve a consultar al servidor
 *  (evita mostrar un historial demasiado desactualizado). */
const TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

type HistorialCacheEntry = {
  pagos: PagoHistorialClienteItem[];
  ts: number;
};

function keyFor(clienteId: string): string {
  return `${PREFIX}${clienteId}`;
}

/** Devuelve el historial cacheado si existe y no está vencido; si no, null. */
export function getHistorialPagosCache(
  clienteId: string
): PagoHistorialClienteItem[] | null {
  try {
    const raw = localStorage.getItem(keyFor(clienteId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as HistorialCacheEntry;
    if (!entry || !Array.isArray(entry.pagos) || typeof entry.ts !== "number") {
      return null;
    }
    if (Date.now() - entry.ts > TTL_MS) return null;
    return entry.pagos;
  } catch {
    return null;
  }
}

/** Guarda (o reemplaza) el historial del cliente en la caché local. */
export function setHistorialPagosCache(
  clienteId: string,
  pagos: PagoHistorialClienteItem[]
): void {
  try {
    const entry: HistorialCacheEntry = { pagos, ts: Date.now() };
    localStorage.setItem(keyFor(clienteId), JSON.stringify(entry));
  } catch {
    /* localStorage lleno o no disponible: se ignora, no es crítico */
  }
}

/** Borra la caché del historial de un cliente (para forzar un refresco). */
export function clearHistorialPagosCache(clienteId: string): void {
  try {
    localStorage.removeItem(keyFor(clienteId));
  } catch {
    /* no-op */
  }
}
