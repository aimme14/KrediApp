import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { syncCustomClaimsForUid } from "@/lib/sync-custom-claims";

/**
 * POST: alinea los custom claims del JWT con Firestore para el usuario del token.
 * Útil tras login (usuarios creados antes de claims) y cuando solo cambió Firestore.
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
    await syncCustomClaimsForUid(decoded.uid);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }
}
