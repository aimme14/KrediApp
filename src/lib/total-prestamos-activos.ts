/**
 * Contador denormalizado `usuarios/{adminId}.totalPrestamosActivos`.
 * Fuente de verdad operativa: préstamos en cobro (activo + saldo > 0).
 */

import {
  isPrestamoCerrado,
  isPrestamoEnCobro,
  normalizeEstadoPrestamo,
} from "@/lib/prestamo-estado";

/**
 * Delta atómico para el contador al cambiar el estado de un préstamo.
 * +1 al pasar a abierto, -1 al cerrar, 0 si no cambia la categoría.
 */
export function deltaTotalPrestamosActivosPorCambioEstado(params: {
  estadoAntes: unknown;
  estadoDespues: unknown;
}): -1 | 0 | 1 {
  const antesAbierto = !isPrestamoCerrado({
    estado: normalizeEstadoPrestamo(params.estadoAntes),
  });
  const despuesAbierto = !isPrestamoCerrado({
    estado: normalizeEstadoPrestamo(params.estadoDespues),
  });
  if (antesAbierto && !despuesAbierto) return -1;
  if (!antesAbierto && despuesAbierto) return 1;
  return 0;
}

/**
 * Delta al eliminar un préstamo: solo resta si aún contaba como abierto.
 */
export function deltaTotalPrestamosActivosAlEliminar(estadoAntes: unknown): -1 | 0 {
  const abierto = !isPrestamoCerrado({
    estado: normalizeEstadoPrestamo(estadoAntes),
  });
  return abierto ? -1 : 0;
}

/** Cuenta préstamos en cobro de un admin (para reconciliación / tests). */
export function contarPrestamosActivosDeAdmin(
  prestamos: Array<{
    adminId?: string | null;
    estado?: string | null;
    saldoPendiente?: number | null;
  }>,
  adminId: string
): number {
  const admin = adminId.trim();
  if (!admin) return 0;
  let n = 0;
  for (const p of prestamos) {
    const pid = typeof p.adminId === "string" ? p.adminId.trim() : "";
    if (pid !== admin) continue;
    if (
      isPrestamoEnCobro({
        estado: normalizeEstadoPrestamo(p.estado),
        saldoPendiente: typeof p.saldoPendiente === "number" ? p.saldoPendiente : 0,
      })
    ) {
      n += 1;
    }
  }
  return n;
}
