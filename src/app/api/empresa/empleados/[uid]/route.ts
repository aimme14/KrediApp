import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import { EMPRESAS_COLLECTION, USERS_COLLECTION, USUARIOS_SUBCOLLECTION } from "@/lib/empresas-db";

/**
 * Actualiza datos de contacto del empleado (solo el admin que lo creó).
 * No modifica correo, contraseña ni ruta.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json(
      { error: "Solo el administrador puede actualizar los datos del empleado" },
      { status: 403 }
    );
  }

  const { uid: empleadoUid } = await params;
  const body = await request.json();
  const { displayName, lugar, direccion, telefono, cedula } = body as {
    displayName?: string;
    lugar?: string;
    direccion?: string;
    telefono?: string;
    cedula?: string;
  };

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
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
      { error: "Solo puedes editar empleados creados por ti" },
      { status: 403 }
    );
  }

  const nombre = displayName.trim();
  const lugarVal = typeof lugar === "string" ? lugar.trim() : "";
  const direccionVal = typeof direccion === "string" ? direccion.trim() : "";
  const telefonoVal = typeof telefono === "string" ? telefono.trim() : "";
  const cedulaVal = typeof cedula === "string" ? cedula.trim() : "";
  const now = new Date();

  await empleadoRef.update({
    displayName: nombre,
    lugar: lugarVal,
    direccion: direccionVal,
    telefono: telefonoVal,
    cedula: cedulaVal,
    updatedAt: now,
  });

  const empresaId = (data.empresaId as string | undefined) ?? apiUser.empresaId;
  if (empresaId) {
    const usuarioRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(empleadoUid);
    const usuarioSnap = await usuarioRef.get();
    if (usuarioSnap.exists) {
      await usuarioRef.update({
        nombre,
        lugar: lugarVal,
        direccion: direccionVal,
        telefono: telefonoVal,
        cedula: cedulaVal,
      });
    }
  }

  try {
    await getAdminAuth().updateUser(empleadoUid, { displayName: nombre });
  } catch {
    // Auth puede fallar si el usuario fue eliminado allí; Firestore ya quedó actualizado.
  }

  return NextResponse.json({ ok: true });
}
