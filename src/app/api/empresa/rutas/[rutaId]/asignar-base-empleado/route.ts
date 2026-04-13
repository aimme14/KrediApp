import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { asignarBaseCajaRutaAEmpleado } from "@/lib/asignar-base-ruta-empleado-admin";

/** POST: traspasa efectivo de la base de la ruta (cajaRuta) a la base del trabajador. Solo admin dueño de la ruta. */
export async function POST(
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
  if (!rutaId || typeof rutaId !== "string") {
    return NextResponse.json({ error: "Ruta no válida" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const empleadoUid =
    typeof body.empleadoUid === "string" ? body.empleadoUid.trim() : "";
  const monto = typeof body.monto === "number" ? body.monto : NaN;

  if (!empleadoUid) {
    return NextResponse.json({ error: "empleadoUid es obligatorio" }, { status: 400 });
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto debe ser un número mayor a cero" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    const result = await asignarBaseCajaRutaAEmpleado(
      db,
      apiUser.empresaId,
      apiUser.uid,
      rutaId,
      empleadoUid,
      monto
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al asignar base";
    const status =
      msg.includes("no está asignado") ||
      msg.includes("Solo puedes") ||
      msg.includes("Saldo insuficiente") ||
      msg.includes("jornada activa en otra")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
