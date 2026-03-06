import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION, USERS_COLLECTION } from "@/lib/empresas-db";

/**
 * Permite al admin habilitar o deshabilitar empleados (trabajadores) que él creó.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { uid: empleadoUid } = await params;
  const body = await request.json();
  const { enabled } = body as { enabled?: boolean };

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "Se requiere enabled (boolean)" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const empleadoRef = db.collection(USERS_COLLECTION).doc(empleadoUid);
  const empleadoSnap = await empleadoRef.get();
  if (!empleadoSnap.exists) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const data = empleadoSnap.data()!;
  if (data.role !== "empleado" || data.createdBy !== apiUser.uid) {
    return NextResponse.json(
      { error: "Solo puedes habilitar o deshabilitar empleados creados por ti" },
      { status: 403 }
    );
  }

  const now = new Date();
  await empleadoRef.update({ enabled, updatedAt: now });

  const empresaId = data.empresaId ?? apiUser.empresaId;
  if (empresaId) {
    const usuarioRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(empleadoUid);
    const usuarioSnap = await usuarioRef.get();
    if (usuarioSnap.exists) {
      await usuarioRef.update({ activo: enabled });
    }
  }

  return NextResponse.json({ ok: true });
}
