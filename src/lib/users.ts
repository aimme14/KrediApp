import {
  collection,
  doc,
  getDocs,
  getDocsFromServer,
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
  cedula?: string;
  lugar?: string;
  direccion?: string;
  telefono?: string;
  base?: string;
  rutaId?: string;
  adminId?: string;
  /** Solo para role === "admin": capital que el jefe asigna al nuevo admin (sale de caja empresa) */
  montoAsignado?: number;
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
 * Habilita o deshabilita un administrador de empresa. Solo superAdmin.
 */
export async function setAdminEmpresaEnabled(
  adminEmpresaUid: string,
  enabled: boolean,
  superAdminUid: string
): Promise<void> {
  const res = await fetch(`/api/admin-empresa/${adminEmpresaUid}/enabled`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, superAdminUid }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al actualizar administrador de empresa");
}

export interface EmpresaAccesoInfo {
  empresaId: string;
  accesoHasta: string | null;
  activa: boolean;
  vencido: boolean;
  diasRestantes: number | null;
}

export async function fetchEmpresasAcceso(
  superAdminUid: string,
  empresaIds: string[]
): Promise<{
  accesos: Record<string, EmpresaAccesoInfo>;
  empresasDeshabilitadas: string[];
}> {
  const res = await fetch("/api/super-admin/empresas-acceso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ superAdminUid, empresaIds }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar fechas de acceso");
  return {
    accesos: data.accesos ?? {},
    empresasDeshabilitadas: Array.isArray(data.empresasDeshabilitadas)
      ? data.empresasDeshabilitadas
      : [],
  };
}

export async function setEmpresaAccesoHasta(
  empresaId: string,
  accesoHasta: string | null,
  superAdminUid: string
): Promise<EmpresaAccesoInfo & { deshabilitadoPorVencimiento?: boolean }> {
  const res = await fetch(`/api/empresa/${encodeURIComponent(empresaId)}/acceso`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accesoHasta, superAdminUid }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al guardar fecha de acceso");
  return data;
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
      codigo: data.codigo,
      jefeCodigo: data.jefeCodigo,
    };
  });
}

/**
 * Lista todos los administradores de empresa (para superAdmin).
 */
export async function listAllAdminEmpresa(): Promise<UserProfile[]> {
  if (!db) return [];
  const q = query(
    collection(db, USERS_COLLECTION),
    where("role", "==", "adminEmpresa")
  );
  const snap = await getDocsFromServer(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      email: data.email ?? "",
      displayName: data.displayName,
      role: "adminEmpresa" as const,
      enabled: data.enabled !== false,
      createdBy: data.createdBy ?? "",
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.(),
      empresaId: data.empresaId,
      codigo: data.codigo,
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
  const snap = await getDocsFromServer(q);
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
      codigo: data.codigo,
    };
  });
}
