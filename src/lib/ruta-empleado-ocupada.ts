/**
 * Una ruta admite solo un trabajador: se considera ocupada si el documento de ruta
 * tiene empleadoId / empleadosIds o si existe un usuario empleado con ese rutaId.
 */

import type { Firestore } from "firebase-admin/firestore";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION } from "@/lib/empresas-db";

export function empleadoAsignadoEnDocumentoRuta(data: Record<string, unknown>): boolean {
  const legacy = typeof data.empleadoId === "string" ? data.empleadoId.trim() : "";
  if (legacy.length > 0) return true;
  const ids = data.empleadosIds;
  if (Array.isArray(ids) && ids.some((x) => typeof x === "string" && String(x).trim().length > 0)) {
    return true;
  }
  return false;
}

/** IDs de ruta que ya tienen un trabajador por `usuarios/{uid}.rutaId`. */
export async function rutaIdsConEmpleadoEnUsuarios(
  db: Firestore,
  empresaId: string
): Promise<Set<string>> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .where("rol", "==", "empleado")
    .get();

  const out = new Set<string>();
  for (const doc of snap.docs) {
    const rid = doc.data()?.rutaId;
    if (typeof rid === "string" && rid.trim()) out.add(rid.trim());
  }
  return out;
}

export async function rutaTieneEmpleadoAsignado(
  db: Firestore,
  empresaId: string,
  rutaId: string,
  datosRuta: Record<string, unknown>
): Promise<boolean> {
  if (empleadoAsignadoEnDocumentoRuta(datosRuta)) return true;
  const desdeUsuarios = await rutaIdsConEmpleadoEnUsuarios(db, empresaId);
  return desdeUsuarios.has(rutaId);
}
