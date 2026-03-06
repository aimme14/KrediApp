import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
} from "@/lib/empresas-db";

/** POST: registrar un pago (cobro). Empleado o admin. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: prestamoId } = await params;
  const body = await request.json();
  const { monto, metodoPago, evidencia } = body as {
    monto?: number;
    metodoPago?: "efectivo" | "transferencia";
    evidencia?: string;
  };

  if (typeof monto !== "number" || monto <= 0) {
    return NextResponse.json({ error: "Monto debe ser un número positivo" }, { status: 400 });
  }
  const metodo = metodoPago === "transferencia" ? "transferencia" : "efectivo";

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
    return NextResponse.json({ error: "No puedes registrar pagos de otra ruta" }, { status: 403 });
  }
  if (apiUser.role !== "empleado" && data.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes registrar pagos de este préstamo" }, { status: 403 });
  }

  const saldoPendiente = (data.saldoPendiente as number) ?? 0;
  const montoAplicar = Math.min(monto, saldoPendiente);
  const nuevoSaldo = Math.round((saldoPendiente - montoAplicar) * 100) / 100;

  const now = new Date();
  await prestamoRef.collection(PAGOS_SUBCOLLECTION).add({
    monto: montoAplicar,
    fecha: now,
    empleadoId: apiUser.uid,
    tipo: "pago",
    metodoPago: metodo,
    evidencia: (evidencia ?? "").trim() || null,
  });

  await prestamoRef.update({
    saldoPendiente: nuevoSaldo,
    estado: nuevoSaldo <= 0 ? "pagado" : data.estado,
    updatedAt: now,
  });

  if (nuevoSaldo <= 0) {
    const clienteId = data.clienteId as string;
    const clienteRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(apiUser.empresaId)
      .collection(CLIENTES_SUBCOLLECTION)
      .doc(clienteId);
    await clienteRef.update({ prestamo_activo: false });
  }

  return NextResponse.json({ ok: true, saldoPendiente: nuevoSaldo });
}
