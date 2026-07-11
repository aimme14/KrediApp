/** Perfil de empresa (documento principal) */
export interface EmpresaProfile {
  nombre: string;
  logo: string;
  dueño: string;
  sedePrincipal: string;
  /** Extendido para nueva estructura */
  fechaCreacion?: Date;
  activa?: boolean;
  dueñoUid?: string;
  /** Fecha límite de acceso YYYY-MM-DD (inclusive, hora Colombia). null = sin límite. */
  accesoHasta?: string | null;
}

/** Capital de empresa: empresas/{{jefeUid}}/capital/cajaEmpresa y agregados (cajaAdmin, cajaEmpleados). */
export interface EmpresaCapitalDoc {
  valor: number;
  updatedAt?: Date;
}
