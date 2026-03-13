import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
} from "@/lib/empresas-db";

const MOTIVOS_NO_PAGO = ["sin_fondos", "no_estaba", "promesa_pago", "otro"] as const;

/** POST: registrar un pago (cobro) o un intento sin pago. Empleado o admin. */
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
  const {
    tipo,
    monto,
    metodoPago,
    evidencia,
    motivoNoPago,
    nota,
  } = body as {
    tipo?: "pago" | "no_pago";
    monto?: number;
    metodoPago?: "efectivo" | "transferencia";
    evidencia?: string;
    motivoNoPago?: string;
    nota?: string;
  };

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
    return NextResponse.json({ error: "No puedes registrar en préstamos de otra ruta" }, { status: 403 });
  }
  if (apiUser.role !== "empleado" && data.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes registrar en este préstamo" }, { status: 403 });
  }

  const now = new Date();

  if (tipo === "no_pago") {
    const motivo =
      motivoNoPago && MOTIVOS_NO_PAGO.includes(motivoNoPago as (typeof MOTIVOS_NO_PAGO)[number])
        ? (motivoNoPago as (typeof MOTIVOS_NO_PAGO)[number])
        : "otro";

    await prestamoRef.collection(PAGOS_SUBCOLLECTION).add({
      monto: 0,
      fecha: now,
      empleadoId: apiUser.uid,
      tipo: "no_pago",
      motivoNoPago: motivo,
      nota: (nota ?? "").trim() || null,
    });

    await prestamoRef.update({
      estado: "mora",
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, tipo: "no_pago" });
  }

  if (typeof monto !== "number" || monto <= 0) {
    return NextResponse.json({ error: "Monto debe ser un número positivo" }, { status: 400 });
  }
  const metodo = metodoPago === "transferencia" ? "transferencia" : "efectivo";

  const saldoPendiente = (data.saldoPendiente as number) ?? 0;
  const montoAplicar = Math.min(monto, saldoPendiente);
  const nuevoSaldo = Math.round((saldoPendiente - montoAplicar) * 100) / 100;

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
