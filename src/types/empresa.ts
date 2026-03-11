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
}

/** Capital de empresa: subcolección empresas/{jefeUid}/capital/actual. Solo lo ve y gestiona el jefe. */
export interface CapitalEmpresa {
  monto: number;
  jefeUid: string;
  updatedAt: Date;
}
