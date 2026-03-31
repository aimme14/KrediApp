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

/** Capital de empresa: empresas/{jefeUid}/capital/cajaEmpresa y agregados (cajaAdmin, cajaEmpleado, capital/root/rutas). */
export interface CapitalEmpresa {
  monto: number;
  jefeUid: string;
  updatedAt: Date;
}
