import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION, USERS_COLLECTION } from "@/lib/empresas-db";

/**
 * Permite al jefe habilitar o deshabilitar administradores que él creó.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid: adminUid } = await params;
    const body = await _request.json();
    const { enabled, jefeUid } = body as { enabled: boolean; jefeUid: string };

    if (typeof enabled !== "boolean" || !jefeUid) {
      return NextResponse.json(
        { error: "Faltan enabled o jefeUid" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const jefeRef = db.collection(USERS_COLLECTION).doc(jefeUid);
    const jefeSnap = await jefeRef.get();
    if (!jefeSnap.exists || jefeSnap.data()?.role !== "jefe") {
      return NextResponse.json(
        { error: "Solo un jefe puede habilitar o deshabilitar a sus administradores" },
        { status: 403 }
      );
    }

    const adminRef = db.collection(USERS_COLLECTION).doc(adminUid);
    const adminSnap = await adminRef.get();
    if (!adminSnap.exists) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const adminData = adminSnap.data();
    const role = adminData?.role;
    if (role !== "admin" || adminData?.createdBy !== jefeUid) {
      return NextResponse.json(
        { error: "Solo puedes habilitar o deshabilitar administradores creados por ti" },
        { status: 403 }
      );
    }

    const now = new Date();
    await adminRef.update({ enabled, updatedAt: now });

    // Actualizar también en empresas/{jefeUid}/usuarios/{adminUid}
    const usuarioRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(jefeUid)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(adminUid);
    const usuarioSnap = await usuarioRef.get();
    if (usuarioSnap.exists) {
      await usuarioRef.update({ activo: enabled });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
