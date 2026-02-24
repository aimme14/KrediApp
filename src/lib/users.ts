import {
  collection,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Role, UserProfile } from "@/types/roles";

const USERS_COLLECTION = "users";

export interface CreateUserParams {
  email: string;
  password: string;
  displayName?: string;
  role: Role;
  createdByUid: string;
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
    q = query(q, where("role", "==", role));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName,
      role: data.role as Role,
      enabled: data.enabled !== false,
      createdBy: data.createdBy ?? "",
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.(),
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
      role: data.role as Role,
      enabled: data.enabled !== false,
      createdBy: data.createdBy ?? "",
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.(),
    };
  });
}
