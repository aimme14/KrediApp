import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";

const USERS_COLLECTION = "users";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid: jefeUid } = await params;
    const body = await _request.json();
    const { enabled, superAdminUid } = body as { enabled: boolean; superAdminUid: string };

    if (typeof enabled !== "boolean" || !superAdminUid) {
      return NextResponse.json(
        { error: "Faltan enabled o superAdminUid" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const superRef = db.collection(USERS_COLLECTION).doc(superAdminUid);
    const superSnap = await superRef.get();
    if (!superSnap.exists || superSnap.data()?.role !== "superAdmin") {
      return NextResponse.json(
        { error: "Solo el Super Administrador puede habilitar o deshabilitar jefes" },
        { status: 403 }
      );
    }

    const jefeRef = db.collection(USERS_COLLECTION).doc(jefeUid);
    const jefeSnap = await jefeRef.get();
    if (!jefeSnap.exists || jefeSnap.data()?.role !== "jefe") {
      return NextResponse.json({ error: "El usuario no es un jefe" }, { status: 403 });
    }

    await jefeRef.update({ enabled, updatedAt: new Date() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
