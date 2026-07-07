/**
 * Roles de la aplicación con jerarquía:
 * superAdmin -> crea jefes y adminEmpresa
 * jefe -> crea admins
 * adminEmpresa -> empresa propia, ingresa a su base; crea trabajadores
 * admin -> creado por jefe; crea trabajadores
 * trabajador -> rol final
 */
export type Role = "superAdmin" | "jefe" | "admin" | "adminEmpresa" | "trabajador";

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: Role;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  /** ID de la empresa (solo para jefe, admin, empleado) */
  empresaId?: string;
  /** Solo para admins/empleados creados por jefe/admin */
  cedula?: string;
  lugar?: string;
  direccion?: string;
  telefono?: string;
  base?: string;
  /** Solo para empleados: UID del admin asignado */
  adminId?: string;
  /** Solo para empleados: ID de la ruta asignada */
  rutaId?: string;
  /** Código de identificación (JF-001 jefe, AD-001 admin) */
  codigo?: string;
  /** Código del jefe que creó a este admin (ej. JF-001). Solo para rol admin. */
  jefeCodigo?: string;
}

/** Quién puede crear a quién */
export const ROLE_HIERARCHY: Record<Role, Role[] | null> = {
  superAdmin: ["jefe", "adminEmpresa"],
  jefe: ["admin"],
  adminEmpresa: ["trabajador"],
  admin: ["trabajador"],
  trabajador: null,
};

export function canCreateRole(actorRole: Role, targetRole: Role): boolean {
  const allowed = ROLE_HIERARCHY[actorRole];
  return Array.isArray(allowed) && allowed.includes(targetRole);
}

export function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    superAdmin: "Super Administrador",
    jefe: "Jefe",
    admin: "Administrador",
    adminEmpresa: "Administrador de empresa",
    trabajador: "Trabajador",
  };
  return labels[role];
}
