import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

/**
 * PATCH: actualizar un pago (p. ej. guardar comprobanteUrl tras generar la imagen).
 * Solo el empleado de la ruta o el admin del préstamo.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pagoId: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: prestamoId, pagoId } = await params;
  const body = await request.json().catch(() => ({}));
  const { comprobanteUrl } = body as { comprobanteUrl?: string };

  if (typeof comprobanteUrl !== "string" || !comprobanteUrl.trim()) {
    return NextResponse.json(
      { error: "comprobanteUrl es obligatorio y debe ser una URL" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId);

  const prestamoSnap = await prestamoRef.get();
  if (!prestamoSnap.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }

  const data = prestamoSnap.data()!;
  if (apiUser.role === "empleado" && apiUser.rutaId && data.rutaId !== apiUser.rutaId) {
    return NextResponse.json(
      { error: "No puedes modificar pagos de préstamos de otra ruta" },
      { status: 403 }
    );
  }
  if (apiUser.role !== "empleado" && data.adminId !== apiUser.uid) {
    return NextResponse.json(
      { error: "No puedes modificar este préstamo" },
      { status: 403 }
    );
  }

  const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc(pagoId);
  const pagoSnap = await pagoRef.get();
  if (!pagoSnap.exists) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }

  await pagoRef.update({
    comprobanteUrl: comprobanteUrl.trim(),
    comprobanteActualizadoAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
