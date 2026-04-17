/**
 * Sincroniza Firebase Auth custom claims con Firestore (/superAdmin o /users).
 * Los claims viajan en el ID token tras verifyIdToken (backend) o getIdTokenResult() (cliente).
 *
 * Límite ~1000 bytes por usuario; mantener solo campos necesarios para autorización.
 */

import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { USERS_COLLECTION } from "@/lib/empresas-db";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";

/** Claims que escribimos en Auth (alineados con verifyIdToken / getIdTokenResult().claims) */
export type AppAuthCustomClaims = {
  role: "superAdmin" | "jefe" | "admin" | "empleado";
  empresaId: string;
  enabled: boolean;
  rutaId?: string;
  adminId?: string;
};

/**
 * Actualiza los custom claims del usuario para que coincidan con sus documentos en Firestore.
 * Si no hay perfil conocido, elimina los claims (null).
 */
export async function syncCustomClaimsForUid(uid: string): Promise<void> {
  const auth = getAdminAuth();
  const db = getAdminFirestore();

  const superSnap = await db.collection(SUPER_ADMIN_COLLECTION).doc(uid).get();
  if (superSnap.exists) {
    const d = superSnap.data()!;
    const claims: AppAuthCustomClaims = {
      role: "superAdmin",
      empresaId: "",
      enabled: d.enabled !== false,
    };
    await auth.setCustomUserClaims(uid, claims as Record<string, unknown>);
    return;
  }

  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) {
    await auth.setCustomUserClaims(uid, null);
    return;
  }

  const data = userSnap.data()!;
  const roleRaw = data.role as string;
  if (roleRaw !== "jefe" && roleRaw !== "admin" && roleRaw !== "empleado") {
    await auth.setCustomUserClaims(uid, null);
    return;
  }

  const empresaId = typeof data.empresaId === "string" ? data.empresaId : "";
  const claims: AppAuthCustomClaims = {
    role: roleRaw as "jefe" | "admin" | "empleado",
    empresaId,
    enabled: data.enabled !== false,
  };

  const rutaId = data.rutaId;
  const adminId = data.adminId;
  if (typeof rutaId === "string" && rutaId.trim()) claims.rutaId = rutaId.trim();
  if (typeof adminId === "string" && adminId.trim()) claims.adminId = adminId.trim();

  await auth.setCustomUserClaims(uid, claims as Record<string, unknown>);
}
