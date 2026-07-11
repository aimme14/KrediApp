import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { verificarYProcesarAccesoEmpresaUsuario } from "@/lib/empresa-acceso";
import { syncCustomClaimsForUid } from "@/lib/sync-custom-claims";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";

/**
 * POST: alinea los custom claims del JWT con Firestore para el usuario del token.
 * También verifica vencimiento de accesoHasta de la empresa (red de seguridad).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const db = getAdminFirestore();

    const superSnap = await db.collection(SUPER_ADMIN_COLLECTION).doc(decoded.uid).get();
    let accesoVencido = false;
    if (!superSnap.exists) {
      const result = await verificarYProcesarAccesoEmpresaUsuario(db, decoded.uid);
      accesoVencido = result.deshabilitado;
    }

    await syncCustomClaimsForUid(decoded.uid);
    return NextResponse.json({ ok: true, accesoVencido });
  } catch {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }
}
