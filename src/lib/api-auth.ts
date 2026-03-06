/**
 * Verifica el token de Firebase en las peticiones API y devuelve el usuario.
 * Usado por las rutas API que requieren empresaId (admin/jefe/empleado).
 */

import { NextRequest } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { USERS_COLLECTION } from "@/lib/empresas-db";

export interface ApiUser {
  uid: string;
  empresaId: string;
  role: "jefe" | "admin" | "empleado";
  /** Solo para empleado: ruta asignada */
  rutaId?: string;
  /** Solo para empleado: admin al que reporta */
  adminId?: string;
}

/**
 * Obtiene el token del header Authorization: Bearer <token> y verifica el usuario.
 * Devuelve { uid, empresaId, role } y para empleado además rutaId.
 */
export async function getApiUser(request: NextRequest): Promise<ApiUser | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const db = getAdminFirestore();
    const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userDoc.exists) return null;

    const data = userDoc.data()!;
    const role = data.role as string;
    if (role !== "jefe" && role !== "admin" && role !== "empleado") return null;

    const empresaId = (data.empresaId as string) ?? "";
    if (!empresaId) return null;

    if (role === "empleado") {
      return {
        uid,
        empresaId,
        role: "empleado",
        rutaId: data.rutaId ?? undefined,
        adminId: data.adminId ?? undefined,
      };
    }
    return { uid, empresaId, role: role as "jefe" | "admin" };
  } catch {
    return null;
  }
}
