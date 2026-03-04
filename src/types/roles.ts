/**
 * Roles de la aplicación con jerarquía:
 * superAdmin -> crea y habilita/deshabilita jefes
 * jefe -> crea admins
 * admin -> crea trabajadores
 * trabajador -> rol final
 */
export type Role = "superAdmin" | "jefe" | "admin" | "trabajador";

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
  /** Solo para admins creados por jefe */
  cedula?: string;
  lugar?: string;
  base?: string;
  /** Solo para empleados: UID del admin asignado */
  adminId?: string;
}

/** Quién puede crear a quién */
export const ROLE_HIERARCHY: Record<Role, Role[] | null> = {
  superAdmin: ["jefe"],
  jefe: ["admin"],
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
    trabajador: "Trabajador",
  };
  return labels[role];
}
