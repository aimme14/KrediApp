/**
 * Tipos para la estructura de Firestore bajo /empresas/{empresaId}
 *
 * Nota: Las contraseñas NUNCA se guardan en Firestore.
 * Firebase Authentication gestiona la autenticación de forma segura.
 */

/** Rol dentro de una empresa (empleado = trabajador en la UI) */
export type RolEmpresa = "jefe" | "admin" | "adminEmpresa" | "empleado";

/** Documento principal de empresa */
export interface EmpresaDoc {
  nombre: string;
  logo: string;
  dueño: string;
  sedePrincipal: string;
  fechaCreacion: Date;
  activa: boolean;
  /** Fecha límite de acceso YYYY-MM-DD (inclusive, hora Colombia). */
  dueñoUid: string;
  /** Fin del acceso por pago; null si no hay límite programado. */
  accesoHasta?: string | null;
}

/** Usuario dentro de una empresa (subcolección usuarios) */
export interface UsuarioEmpresaDoc {
  nombre: string;
  email: string;
  rol: RolEmpresa;
  activo: boolean;
  creadoPor: string; // usuarioId
  adminId?: string; // solo si rol === "empleado"
  cedula?: string;
  lugar?: string;
  direccion?: string;
  telefono?: string;
  base?: string;
  rutaId?: string; // solo si rol === "empleado"
  fechaCreacion?: Date;
}

/** Índice de auth: /users/{uid} - para búsqueda rápida al iniciar sesión */
export interface UserAuthIndex {
  empresaId: string;
  role: "jefe" | "admin" | "adminEmpresa" | "empleado";
  email: string;
  displayName?: string;
  enabled: boolean;
  createdBy: string;
}

/** Ruta de cobranza */
export interface RutaDoc {
  nombre: string;
  ubicacion?: string;
  base?: string;
  descripcion?: string;
  adminId: string;
  empleadoId?: string; // quien cobra la ruta (opcional al crear)
  fechaCreacion: Date;
  /** Código legible RT-{adminNum}-{routeNum} (id técnico es el doc id) */
  codigo?: string;
}

/** Cliente */
export interface ClienteDoc {
  nombre: string;
  ubicacion: string;
  direccion: string;
  telefono: string;
  cedula: string;
  rutaId: string;
  adminId: string;
  prestamo_activo: boolean;
  fechaCreacion: Date;
  /** Si true, cliente excluido de la ruta normal (caso especial, no volver a prestar) */
  moroso?: boolean;
  /** Código legible CL-{adminNum}-{rutaNum}-{clienteNum} */
  codigo?: string;
}

/** Estado del préstamo */
export type EstadoPrestamo = "activo" | "pagado" | "castigado";

/** Quién/qué provocó el cierre del préstamo */
export type CierrePrestamoTipo = "cobro" | "castigo";

/** Modalidad de pago */
export type ModalidadPago = "diario" | "semanal" | "mensual";

/**
 * Días de cobro para sugerir fecha final (informativo).
 * "5" = lun–vie · "6" = lun–sáb · "personalizado" = elección libre
 */
export type DiasCobroModo = "5" | "6" | "personalizado";

/** Préstamo */
export interface PrestamoDoc {
  clienteId: string;
  rutaId: string;
  adminId: string;
  empleadoId: string;
  monto: number;
  interes: number; // porcentaje
  modalidad: ModalidadPago;
  numeroCuotas: number;
  totalAPagar: number;
  saldoPendiente: number;
  estado: EstadoPrestamo;
  fechaInicio: Date;
  /**
   * Fecha final informativa (YYYY-MM-DD). Manual al crear.
   * No afecta cierres ni cálculos financieros.
   */
  fechaFinal?: string;
  /**
   * Modo de días de cobro usado al sugerir/definir la fecha final.
   * Informativo / UX. Opcional en docs legacy.
   * - "5": lun–vie
   * - "6": lun–sáb
   * - "personalizado": fecha elegida sin sugerencia automática
   */
  diasCobroModo?: DiasCobroModo;
  /**
   * @deprecated Legado — fin previsto calculado. Leer con `effectiveFechaFinal`.
   * Nuevos préstamos no lo escriben.
   */
  fechaVencimiento?: Date;
  /** Copia de cliente.moroso — sincronizado al marcar/desmarcar moroso. */
  moroso?: boolean;
  /** Suma acumulada de pérdidas/castigos parciales reconocidos sobre este préstamo. */
  totalCastigado?: number;
  /** Cobro bruto acumulado al momento del castigo (capital + interés cobrado).
   * Solo préstamos castigados. No confundir con PagoDoc.cobradoAcumulado (auditoría del evento). */
  cobradoAcumulado?: number;
  /** Fecha en que el préstamo quedó cerrado (pagado o castigado). */
  fechaCierre?: Date;
  /** Cómo se cerró: cobro real o castigo/incobro. */
  cerradoPor?: CierrePrestamoTipo;
}

/** Tipo de pago / registro en subcolección pagos */
export type TipoPago = "pago" | "no_pago" | "perdida";

/** Motivo cuando el cliente no pagó */
export type MotivoNoPago =
  | "sin_fondos"
  | "no_estaba"
  | "promesa_pago"
  | "otro";

/** Método de pago al cobrar (efectivo/transferencia) */
export type MetodoPago = "efectivo" | "transferencia";

/** Motivo al registrar pérdida/castigo */
export type MotivoPerdida =
  | "imposible_cobrar"
  | "cliente_perdido"
  | "acuerdo_quita"
  | "otro";

/** Estado del documento de pago en Firestore */
export type EstadoPagoDoc = "activo" | "anulado";

/** Pago dentro de un préstamo (o registro de intento sin pago / pérdida) */
export interface PagoDoc {
  monto: number;
  fecha: Date;
  empleadoId: string;
  tipo: TipoPago;
  /** activo por defecto; anulado tras corrección admin */
  estado?: EstadoPagoDoc;
  /** Efectivo o transferencia (solo si tipo === "pago") */
  metodoPago?: MetodoPago;
  /** URL de la foto de la evidencia del cobro (solo si tipo === "pago") */
  evidencia?: string;
  /** Motivo por el que no pagó (solo si tipo === "no_pago") */
  motivoNoPago?: MotivoNoPago;
  /** Motivo del castigo (solo si tipo === "perdida") */
  motivoPerdida?: MotivoPerdida;
  /** Nota adicional (no_pago o perdida) */
  nota?: string;
  /** Desglose contable del castigo */
  parteCapitalPerdida?: number;
  parteGananciaPerdida?: number;
  /** Cobro bruto acumulado antes del castigo (solo si tipo === "perdida") */
  cobradoAcumulado?: number;
  /** Desglose contable del cobro (solo si tipo === "pago") */
  cuotaCapital?: number;
  cuotaGanancia?: number;
  /** Denormalización para collectionGroup admin */
  adminId?: string;
  empresaId?: string;
  prestamoId?: string;
  rutaId?: string;
  clienteId?: string;
  clienteNombre?: string;
  rutaNombre?: string;
  cobradoPorRol?: string;
  /** Snapshots para reversión (solo cobros con tieneSnapshotsCompletos) */
  saldoPendienteAntes?: number;
  saldoPendienteDespues?: number;
  adelantoCuotaAntes?: number;
  adelantoCuotaDespues?: number;
  estadoPrestamoAntes?: EstadoPrestamo;
  estadoPrestamoDespues?: EstadoPrestamo;
  acreditaCajaRuta?: boolean;
  tieneSnapshotsCompletos?: boolean;
}

/** Tipo de gasto */
export type TipoGasto = "transporte" | "alimentacion" | "otro";

/** Gasto */
export interface GastoDoc {
  descripcion: string;
  monto: number;
  fecha: Date;
  tipo: TipoGasto;
  creadoPor: string;
  rol: "admin" | "empleado";
  rutaId?: string; // si aplica
  adminId: string;
  empresaId?: string;
}
