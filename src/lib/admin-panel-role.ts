import type { Role } from "@/types/roles";

/** Admin de panel: dependiente del jefe o admin empresa (creado por super admin). */
export function isAdminPanelRole(role: Role | string | undefined): boolean {
  return role === "admin" || role === "adminEmpresa";
}

export function isAdminEmpresaRole(role: Role | string | undefined): boolean {
  return role === "adminEmpresa";
}

export function isAdminPanelApiUser(user: { role?: string } | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "adminEmpresa";
}
