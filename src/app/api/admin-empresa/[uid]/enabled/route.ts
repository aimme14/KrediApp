import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { syncCustomClaimsForUid } from "@/lib/sync-custom-claims";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION, USERS_COLLECTION } from "@/lib/empresas-db";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid: adminEmpresaUid } = await params;
    const body = await _request.json();
    const { enabled, superAdminUid } = body as { enabled: boolean; superAdminUid: string };

    if (typeof enabled !== "boolean" || !superAdminUid) {
      return NextResponse.json(
        { error: "Faltan enabled o superAdminUid" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const superRef = db.collection(SUPER_ADMIN_COLLECTION).doc(superAdminUid);
    const superSnap = await superRef.get();
    if (!superSnap.exists || superSnap.data()?.role !== "superAdmin") {
      return NextResponse.json(
        { error: "Solo el Super Administrador puede habilitar o deshabilitar administradores de empresa" },
        { status: 403 }
      );
    }

    const userRef = db.collection(USERS_COLLECTION).doc(adminEmpresaUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists || userSnap.data()?.role !== "adminEmpresa") {
      return NextResponse.json(
        { error: "El usuario no es un administrador de empresa" },
        { status: 403 }
      );
    }

    const now = new Date();
    await userRef.update({ enabled, updatedAt: now });

    const usuarioRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(adminEmpresaUid)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(adminEmpresaUid);
    const usuarioSnap = await usuarioRef.get();
    if (usuarioSnap.exists) {
      await usuarioRef.update({ activo: enabled });
    }

    const empRef = db.collection(EMPRESAS_COLLECTION).doc(adminEmpresaUid);
    const empSnap = await empRef.get();
    if (empSnap.exists) {
      await empRef.update({ activa: enabled });
    }

    await syncCustomClaimsForUid(adminEmpresaUid);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
