/**
 * Tipos para la estructura de Firestore bajo /empresas/{empresaId}
 *
 * Nota: Las contraseñas NUNCA se guardan en Firestore.
 * Firebase Authentication gestiona la autenticación de forma segura.
 */

/** Rol dentro de una empresa (empleado = trabajador en la UI) */
export type RolEmpresa = "jefe" | "admin" | "empleado";

/** Documento principal de empresa */
export interface EmpresaDoc {
  nombre: string;
  logo: string;
  dueño: string;
  sedePrincipal: string;
  fechaCreacion: Date;
  activa: boolean;
  /** UID del jefe dueño de la empresa */
  dueñoUid: string;
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
  role: "jefe" | "admin" | "empleado";
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
  /** Si false, los trabajadores no pueden usar cobros hasta que el admin abra (manual). Omisión = abierta. */
  rutaOperativa?: boolean;
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
export type EstadoPrestamo = "activo" | "pagado" | "mora";

/** Modalidad de pago */
export type ModalidadPago = "diario" | "semanal" | "mensual";

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
  fechaVencimiento: Date;
  multaMora: number; // porcentaje
}

/** Tipo de pago / registro en subcolección pagos */
export type TipoPago = "pago" | "mora" | "no_pago";

/** Motivo cuando el cliente no pagó */
export type MotivoNoPago =
  | "sin_fondos"
  | "no_estaba"
  | "promesa_pago"
  | "otro";

/** Método de pago al cobrar (efectivo/transferencia) */
export type MetodoPago = "efectivo" | "transferencia";

/** Pago dentro de un préstamo (o registro de intento sin pago) */
export interface PagoDoc {
  monto: number;
  fecha: Date;
  empleadoId: string;
  tipo: TipoPago;
  /** Efectivo o transferencia (solo si tipo === "pago") */
  metodoPago?: MetodoPago;
  /** URL de la foto de la evidencia del cobro (solo si tipo === "pago") */
  evidencia?: string;
  /** Motivo por el que no pagó (solo si tipo === "no_pago") */
  motivoNoPago?: MotivoNoPago;
  /** Nota adicional (solo si tipo === "no_pago") */
  nota?: string;
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
  empleadoId?: string; // null si lo hace el admin
  /** URL de la foto del comprobante/factura */
  evidencia?: string;
}

