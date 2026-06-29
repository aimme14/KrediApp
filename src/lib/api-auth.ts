/**
 * Verifica el token de Firebase en las peticiones API y devuelve el usuario.
 * Usado por las rutas API que requieren empresaId (admin/jefe/empleado).
 *
 * Fast path: si los custom claims ya están en el token (sync-claims ejecutado),
 * no se hace ninguna lectura a Firestore. Coste: solo verifyIdToken().
 *
 * Fallback: si los claims están ausentes o incompletos (usuario recién creado
 * o token sin refrescar), lee /users/{uid} en Firestore — mismo comportamiento anterior.
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
 * Devuelve { uid, empresaId, role } y para empleado además rutaId y adminId.
 */
export async function getApiUser(request: NextRequest): Promise<ApiUser | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const claimRole = decoded.role as string | undefined;
    const claimEmpresaId = decoded.empresaId as string | undefined;

    // ── Fast path: claims presentes → sin lectura a Firestore ──
    if (
      (claimRole === "jefe" || claimRole === "admin" || claimRole === "empleado") &&
      claimEmpresaId
    ) {
      if (claimRole === "empleado") {
        return {
          uid,
          empresaId: claimEmpresaId,
          role: "empleado",
          rutaId: typeof decoded.rutaId === "string" && decoded.rutaId ? decoded.rutaId : undefined,
          adminId: typeof decoded.adminId === "string" && decoded.adminId ? decoded.adminId : undefined,
        };
      }
      return { uid, empresaId: claimEmpresaId, role: claimRole };
    }

    // ── Fallback: claims ausentes o incompletos → leer Firestore ──
    // Ocurre en usuarios recién creados o con token sin refrescar post-sync.
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
