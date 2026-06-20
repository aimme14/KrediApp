import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  FINANCIAL_OPERATIONS_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

/** GET: consultar si una clave de idempotencia de cobro ya fue procesada. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: prestamoId } = await params;
  const key = new URL(request.url).searchParams.get("key")?.trim();
  if (!key) return NextResponse.json({ processed: false });

  const db = getAdminFirestore();

  const prestamoSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId)
    .get();

  if (!prestamoSnap.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }

  const prestamo = prestamoSnap.data()!;
  if (
    apiUser.role === "empleado" &&
    apiUser.rutaId &&
    prestamo.rutaId !== apiUser.rutaId
  ) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  if (apiUser.role !== "empleado" && prestamo.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const opSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(FINANCIAL_OPERATIONS_SUBCOLLECTION)
    .doc(key)
    .get();

  if (!opSnap.exists) return NextResponse.json({ processed: false });

  const data = opSnap.data() as Record<string, unknown>;

  if (data.uid !== apiUser.uid) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }
  if (data.endpoint !== `prestamos:${prestamoId}:pagos`) {
    return NextResponse.json({ processed: false });
  }

  if (data.status === "done" && data.ok === true && data.httpStatus === 200) {
    return NextResponse.json({
      processed: true,
      payload: data.response ?? {},
    });
  }

  if (data.status === "done" && !data.ok) {
    return NextResponse.json({
      processed: false,
      failed: true,
      error:
        (data.response as Record<string, unknown>)?.error ?? "Error desconocido",
    });
  }

  if (data.status === "processing") {
    return NextResponse.json({ processed: false, processing: true });
  }

  return NextResponse.json({ processed: false });
}
