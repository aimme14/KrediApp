import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { verificarYProcesarAccesoEmpresaUsuario } from "@/lib/empresa-acceso";
import { syncCustomClaimsForUid } from "@/lib/sync-custom-claims";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";
import { withRateLimit } from "@/lib/with-rate-limit";
import { authLimiterUser } from "@/lib/rate-limit";

/**
 * POST: alinea los custom claims del JWT con Firestore para el usuario del token.
 * También verifica vencimiento de accesoHasta de la empresa (red de seguridad).
 */
async function handler(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const db = getAdminFirestore();

    // Super Admin: no tiene empresa, solo sincronizar claims
    const superSnap = await db.collection("superAdmin").doc(decoded.uid).get();
    if (superSnap.exists) {
      await syncCustomClaimsForUid(decoded.uid);
      return NextResponse.json({ ok: true });
    }

    // Usuarios de empresa: verificar accesoHasta y sincronizar
    const { deshabilitado } = await verificarYProcesarAccesoEmpresaUsuario(db, decoded.uid);
    await syncCustomClaimsForUid(decoded.uid);
    return NextResponse.json({ ok: true, accesoVencido: deshabilitado });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al sincronizar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRateLimit(authLimiterUser, handler);
