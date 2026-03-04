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
