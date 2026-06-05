import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  evaluarAprobacionPrestamoEmpleado,
  validarClienteElegibleParaPrestamo,
} from "@/lib/prestamo-aprobacion-empleado";

/** GET: empleado — evalúa si un préstamo requiere aprobación del admin. */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores" }, { status: 403 });
  }

  const clienteId = request.nextUrl.searchParams.get("clienteId")?.trim();
  const montoRaw = request.nextUrl.searchParams.get("monto");
  const monto = montoRaw !== null && montoRaw !== "" ? Number(montoRaw) : NaN;

  if (!clienteId) {
    return NextResponse.json({ error: "clienteId es obligatorio" }, { status: 400 });
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "monto debe ser un número positivo" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const clienteSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId)
    .get();

  if (!clienteSnap.exists) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  try {
    validarClienteElegibleParaPrestamo(clienteSnap.data() as Record<string, unknown>);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cliente no elegible" },
      { status: 400 }
    );
  }

  const evaluacion = await evaluarAprobacionPrestamoEmpleado(
    db,
    apiUser.empresaId,
    clienteId,
    monto
  );

  return NextResponse.json({
    requiereAprobacionAdmin: evaluacion.requiereAprobacionAdmin,
    motivo: evaluacion.motivo,
    montoUltimoPrestamo: evaluacion.montoUltimoPrestamo,
    cantidadPrestamosHistoricos: evaluacion.cantidadPrestamosHistoricos,
  });
}
