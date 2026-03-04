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
  base?: string;
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
  descripcion: string;
  adminId: string;
  empleadoId: string; // quien cobra la ruta
  fechaCreacion: Date;
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
  totalAPagar: number;
  saldoPendiente: number;
  estado: EstadoPrestamo;
  fechaInicio: Date;
  fechaVencimiento: Date;
  multaMora: number; // porcentaje
}

/** Tipo de pago */
export type TipoPago = "pago" | "mora";

/** Pago dentro de un préstamo */
export interface PagoDoc {
  monto: number;
  fecha: Date;
  empleadoId: string;
  tipo: TipoPago;
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
}
