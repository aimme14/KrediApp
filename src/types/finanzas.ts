import type { Timestamp } from "firebase/firestore";

/**
 * Tipos financieros de nivel empresa/jefe, admin, ruta y cobros.
 * Se guardan en Firestore bajo /empresas/{empresaId} (o jefeUid para capital empresa).
 */

// ── Capital empresa (Jefe) ───────────
/**
 * Documento empresas/{jefeUid}/capital/cajaEmpresa (Firestore: caja, jefeUid, updatedAt; sin capitalEmpresa persistido).
 * En API, capitalEmpresa = cajaEmpresa + Σ(capitalAdmin); los gastos descuentan la caja al registrarse.
 * El flujo de cambios vive en la subcolección `flujo` bajo este documento (no en el array `historial`).
 */
export interface CapitalEmpresa {
  /** Calculado en servidor; puede omitirse en el documento Firestore. */
  capitalEmpresa?: number;
  cajaEmpresa: number;
  gastosEmpresa: number;
  jefeUid: string;
  updatedAt: Timestamp;
  /** @deprecated En servidor ya no se escribe; usar subcolección `flujo`. */
  historial?: CapitalHistorialEntry[];
}

export interface CapitalHistorialEntry {
  montoAnterior: number;
  montoNuevo: number;
  at: Timestamp | Date;
}

// ── Admin financiero ─────────────────
/** Datos financieros del admin. Ubicación: empresas/{empresaId}/usuarios/{adminUid} (campos cajaAdmin) o subcolección. */
export interface AdminFinanciero {
  cajaAdmin: number;
  ultimaActualizacion: Timestamp;
}

// ── Cierre mensual ───────────────────
/** Snapshot por ruta en un cierre. */
export interface CierreRutaSnapshot {
  rutaId: string;
  nombre: string;
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
  gastos: number;
  utilidad: number;
  capitalTotal: number;
}

/** Documento empresas/{empresaId}/cierresMensuales/{periodo}. periodo = "YYYY-MM" */
export interface CierreMensual {
  periodo: string;
  fechaCierre: Timestamp;
  rutas: CierreRutaSnapshot[];
  cajaEmpresa?: number;
  gastosEmpresa?: number;
  capitalEmpresa?: number;
  /** Suma de capitalAdmin de todos los administradores */
  capitalAsignadoAdmins?: number;
  utilidadGlobal?: number;
}

// ── Ruta ──────────────────────────────
export interface RutaFinanciera {
  id: string;
  nombre: string;
  zonaId: string;
  empleadosIds: string[];
  adminId: string;

  // Capital (siempre debe cuadrar)
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  capitalTotal: number;

  // Acumulados históricos para la ruta
  ganancias: number;
  gastos: number;
  perdidas: number;

  fechaCreacion: Timestamp;
  ultimaActualizacion: Timestamp;

  /** false = admin cerró la ruta; trabajadores no deben operar hasta reapertura. */
  rutaOperativa?: boolean;
}

// ── Estados y tipos de cuota / cobros ─
export type FrecuenciaCuota = "diario" | "semanal" | "quincenal" | "mensual";

export type EstadoCuota =
  | "pendiente"
  | "parcial"
  | "mora"
  | "pagada"
  | "incobrable";

export type ResultadoIntentoCobro = "pagado" | "no_pagado";

export type MetodoPagoIntento = "efectivo" | "transferencia";

export type MotivoNoPago =
  | "sin_fondos"
  | "no_estaba"
  | "promesa_pago"
  | "otro";

/** Clasificación al registrar pérdida (saldo que no se cobrará: de inversiones a pérdidas en la ruta). */
export type MotivoPerdida =
  | "imposible_cobrar"
  | "cliente_perdido"
  | "acuerdo_quita"
  | "otro";

// ── Extensiones previstas para Cuota ──
/**
 * Campos adicionales que se deben agregar a la interfaz de Cuota
 * existente en el modelo de préstamos cuando se implemente
 * la subcolección de cuotas por préstamo.
 */
export interface CuotaFinancieraExtension {
  cobradorId: string;
  clienteNombre: string;
  clienteDireccion: string;
  frecuencia: FrecuenciaCuota;
  estado: EstadoCuota;
  montoAbonado: number;
  saldoPendiente: number;
  numeroCuota: number;
  totalCuotas: number;
  fechaVencimiento: Timestamp;
  fechaPago?: Timestamp;
}

// ── Extensiones para IntentoCobro ─────
export interface DistribucionCuotas {
  cuotasCerradas: string[];
  cuotaParcial?: {
    cuotaId: string;
    montoAbonado: number;
    saldoPendiente: number;
  };
  excedente: number;
}

export interface IntentoCobroExtension {
  resultado: ResultadoIntentoCobro;
  metodoPago?: MetodoPagoIntento;
  montoPagado?: number;
  motivoNoPago?: MotivoNoPago;
  nota?: string;
  distribucion?: DistribucionCuotas;
}

// ── ClienteRuta (pantalla ruta del día) ─
export type PrioridadClienteRuta = 1 | 2 | 3 | 4 | 5;

export interface ClienteRuta {
  cuotaId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  clienteDireccion: string;
  /** Zona del cobrador/cliente (ej. barrio o base) */
  zona?: string;
  monto: number;
  /** Fecha de vencimiento en capa de aplicación (si viene de API como ISO string se convierte a Date) */
  fechaVencimiento: Date | null;
  estado: string;
  frecuencia: string;
  numeroCuota: number;
  totalCuotas: number;
  diasMora: number;
  intentosFallidos: number;
  prioridad: PrioridadClienteRuta;
  visitado: boolean;
  /** True si el último pago del préstamo fue hoy (semáforo verde en ruta del día). */
  cuotaPagadaHoy: boolean;
}

/** Grupo de ítems de ruta agrupados por cliente (una fila por cliente en la UI) */
export interface ClienteRutaGrupo {
  clienteId: string;
  clienteNombre: string;
  clienteDireccion: string;
  zona?: string;
  /** Suma de saldos pendientes de todos los préstamos del cliente */
  totalMonto: number;
  /** Cuántos préstamos activos con saldo agrupan esta fila */
  cantidadPrestamos: number;
  /** Prioridad más urgente del grupo (1 = más urgente) */
  prioridadMax: PrioridadClienteRuta;
  /** Máximos días de mora entre los ítems */
  diasMoraMax: number;
  /** Si el cobrador ya visitó a este cliente hoy (localStorage) */
  visitado: boolean;
  /** Ítems ordenados por urgencia (misma regla que la lista); el primero abre en Cobrar */
  items: ClienteRuta[];
}

