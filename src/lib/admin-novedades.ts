/** Identificador de la novedad: eliminar préstamos sin cobros (jul 2026). */
export const ADMIN_NOVEDAD_PRESTAMOS_DELETE = "prestamos-delete-v1";

export function adminNovedadStorageKey(uid: string, novedadId: string): string {
  return `kredi:admin-novedad:${novedadId}:${uid}`;
}

export function isAdminNovedadDismissed(uid: string, novedadId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(adminNovedadStorageKey(uid, novedadId)) === "1";
  } catch {
    return true;
  }
}

export function dismissAdminNovedad(uid: string, novedadId: string): void {
  try {
    window.localStorage.setItem(adminNovedadStorageKey(uid, novedadId), "1");
  } catch {
    /* localStorage no disponible */
  }
}
