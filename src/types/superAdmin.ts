/**
 * Colección Firestore: /superAdmin/{adminID}
 *
 * Almacena los datos del Super Administrador.
 * La contraseña NUNCA se guarda aquí; Firebase Auth la gestiona de forma segura.
 */
export const SUPER_ADMIN_COLLECTION = "superAdmin";

export interface SuperAdminProfile {
  /** UID de Firebase Auth (mismo que el ID del documento) */
  uid: string;
  /** Correo electrónico */
  email: string;
  /** Nombre para mostrar (opcional) */
  displayName?: string;
  /** Siempre "superAdmin" */
  role: "superAdmin";
  /** Si la cuenta está activa */
  enabled: boolean;
  /** UID de quien creó este super admin (vacío para el primero) */
  createdBy: string;
  /** Fecha de creación */
  createdAt: Date;
  /** Última actualización */
  updatedAt: Date;
  /** Si el correo está verificado en Auth */
  emailVerified: boolean;
  /** Último inicio de sesión (auditoría) */
  lastLoginAt?: Date;
}
