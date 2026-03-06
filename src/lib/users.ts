import {
  collection,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Role, UserProfile } from "@/types/roles";
import { USERS_COLLECTION } from "./empresas-db";

/** Mapea rol de Firestore (empleado) a Role de la app (trabajador) */
function fromRolFirestore(role: string): Role {
  return role === "empleado" ? "trabajador" : (role as Role);
}

/** Mapea Role de la app a rol en Firestore para consultas */
function toRolFirestore(role: Role): string {
  return role === "trabajador" ? "empleado" : role;
}

export interface CreateUserParams {
  email: string;
  password: string;
  displayName?: string;
  role: Role;
  createdByUid: string;
  /** Opcional: datos del empleado/trabajador */
  cedula?: string;
  lugar?: string;
  direccion?: string;
  telefono?: string;
  base?: string;
  /** ID de la ruta asignada al empleado */
  rutaId?: string;
}

/**
 * Crea un usuario vía API (Firebase Admin). El usuario actual no pierde la sesión.
 */
export async function createUser(params: CreateUserParams): Promise<string> {
  const res = await fetch("/api/users/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al crear usuario");
  return data.uid;
}

/**
 * Habilita o deshabilita un jefe. Solo superAdmin puede hacerlo. Se usa la API.
 */
export async function setJefeEnabled(
  jefeUid: string,
  enabled: boolean,
  superAdminUid: string
): Promise<void> {
  const res = await fetch(`/api/jefes/${jefeUid}/enabled`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, superAdminUid }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al actualizar jefe");
}

/**
 * Habilita o deshabilita un administrador. Solo el jefe que lo creó puede hacerlo.
 */
export async function setAdminEnabled(
  adminUid: string,
  enabled: boolean,
  jefeUid: string
): Promise<void> {
  const res = await fetch(`/api/users/${adminUid}/enabled`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, jefeUid }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al actualizar administrador");
}

/**
 * Lista usuarios por rol (opcional) creados por un usuario dado.
 */
export async function listUsersByCreator(
  createdByUid: string,
  role?: Role
): Promise<UserProfile[]> {
  if (!db) return [];
  let q = query(
    collection(db, USERS_COLLECTION),
    where("createdBy", "==", createdByUid)
  );
  if (role) {
    q = query(q, where("role", "==", toRolFirestore(role)));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName,
      role: fromRolFirestore(data.role ?? ""),
      enabled: data.enabled !== false,
      createdBy: data.createdBy ?? "",
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.(),
      empresaId: data.empresaId,
      cedula: data.cedula,
      lugar: data.lugar,
      direccion: data.direccion,
      telefono: data.telefono,
      base: data.base,
      rutaId: data.rutaId,
      adminId: data.adminId,
    };
  });
}

/**
 * Lista todos los jefes (para superAdmin).
 */
export async function listAllJefes(): Promise<UserProfile[]> {
  if (!db) return [];
  const q = query(
    collection(db, USERS_COLLECTION),
    where("role", "==", "jefe")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName,
      role: fromRolFirestore(data.role ?? ""),
      enabled: data.enabled !== false,
      createdBy: data.createdBy ?? "",
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.(),
      empresaId: data.empresaId,
    };
  });
}
