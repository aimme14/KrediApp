import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, CLIENTES_SUBCOLLECTION } from "@/lib/empresas-db";

/** PATCH: marcar o desmarcar cliente como moroso (excluido de ruta, no volver a prestar) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: clienteId } = await params;
  const body = await request.json();
  const { moroso } = body as { moroso?: boolean };

  if (typeof moroso !== "boolean") {
    return NextResponse.json({ error: "Se requiere moroso (boolean)" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId);

  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }
  if (snap.data()?.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes modificar este cliente" }, { status: 403 });
  }

  await ref.update({ moroso });
  return NextResponse.json({ ok: true });
}
