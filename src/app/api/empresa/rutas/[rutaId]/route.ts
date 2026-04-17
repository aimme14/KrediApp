import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, RUTAS_SUBCOLLECTION } from "@/lib/empresas-db";

/**
 * PATCH: admin actualiza si la ruta permite operación a los trabajadores (`rutaOperativa`).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ rutaId: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { rutaId } = await params;
  const id = typeof rutaId === "string" ? rutaId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "rutaId inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const ro = body?.rutaOperativa;
  if (typeof ro !== "boolean") {
    return NextResponse.json({ error: "rutaOperativa debe ser boolean" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(id);

  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  const adminId = snap.data()?.adminId;
  if (typeof adminId !== "string" || adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes editar esta ruta" }, { status: 403 });
  }

  await ref.update({
    rutaOperativa: ro,
    ultimaActualizacion: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, rutaOperativa: ro });
}
