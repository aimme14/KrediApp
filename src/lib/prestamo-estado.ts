import type { CierrePrestamoTipo, EstadoPrestamo } from "@/types/firestore";

export const ESTADO_PRESTAMO_ABIERTO = "activo" as const;

/** Normaliza el estado del préstamo al leer desde Firestore. */
export function normalizeEstadoPrestamo(estado: unknown): EstadoPrestamo {
  if (estado === "pagado") return "pagado";
  if (estado === "castigado") return "castigado";
  return ESTADO_PRESTAMO_ABIERTO;
}

/** El préstamo sigue en cobro activo (tiene saldo pendiente real). */
export function isPrestamoEnCobro(p: {
  estado: string;
  saldoPendiente?: number;
}): boolean {
  return p.estado === "activo" && (p.saldoPendiente ?? 0) > 0;
}

/** El préstamo está cerrado, sin importar cómo (cobro o castigo). */
export function isPrestamoCerrado(p: { estado: string }): boolean {
  return p.estado === "pagado" || p.estado === "castigado";
}

/** El préstamo se cerró específicamente por castigo/incobro. */
export function isPrestamoCastigado(p: { estado: string }): boolean {
  return p.estado === "castigado";
}

/** Etiqueta legible para UI. */
export function labelEstadoPrestamo(p: {
  estado: string;
  totalCastigado?: number;
}): string {
  if (p.estado === "castigado") return "Pérdida";
  if (p.estado === "pagado") return "Pagado";
  if ((p.totalCastigado ?? 0) > 0) return "Activo (con pérdida parcial)";
  return "Activo";
}

export type ResolverEstadoTrasMovimientoParams = {
  tipo: "pago" | "perdida";
  nuevoSaldo: number;
};

export type ResolverEstadoTrasMovimientoResultado = {
  estado: EstadoPrestamo;
  cerradoPor?: CierrePrestamoTipo;
  /** true si este movimiento cierra el préstamo (debe setear fechaCierre). */
  cierraPrestamo: boolean;
};

/**
 * Función pura: decide el nuevo estado del préstamo tras un cobro o una pérdida.
 * Único lugar de la verdad para esta regla — no duplicar este condicional en otro archivo.
 */
export function resolverEstadoTrasMovimiento(
  params: ResolverEstadoTrasMovimientoParams
): ResolverEstadoTrasMovimientoResultado {
  const { tipo, nuevoSaldo } = params;

  if (nuevoSaldo > 0) {
    return { estado: "activo", cierraPrestamo: false };
  }

  if (tipo === "perdida") {
    return { estado: "castigado", cerradoPor: "castigo", cierraPrestamo: true };
  }

  return { estado: "pagado", cerradoPor: "cobro", cierraPrestamo: true };
}

/** Preserva un cierre previo (pagado/castigado) si ya existía; si no, vuelve a activo. */
export function estadoTrasNoPago(estadoActual: unknown): EstadoPrestamo {
  const normalizado = normalizeEstadoPrestamo(estadoActual);
  if (isPrestamoCerrado({ estado: normalizado })) return normalizado;
  return "activo";
}
