import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { listUltimosPrestamosClienteUi } from "@/lib/prestamo-aprobacion-empleado";

/**
 * GET: últimos 3 préstamos de un cliente (historial para crear préstamo).
 * Empleado: solo clientes de su ruta. Admin: clientes de sus rutas. Jefe: todos.
 */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const clienteId = request.nextUrl.searchParams.get("clienteId")?.trim();
  if (!clienteId) {
    return NextResponse.json({ error: "clienteId es obligatorio" }, { status: 400 });
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

  const cliente = clienteSnap.data() as Record<string, unknown>;
  const clienteRutaId = typeof cliente.rutaId === "string" ? cliente.rutaId : "";
  const clienteAdminId = typeof cliente.adminId === "string" ? cliente.adminId : "";

  let autorizado = false;
  if (apiUser.role === "jefe") {
    autorizado = true;
  } else if (apiUser.role === "empleado") {
    autorizado = Boolean(apiUser.rutaId && clienteRutaId === apiUser.rutaId);
  } else {
    // admin / adminEmpresa
    autorizado = clienteAdminId === apiUser.uid;
    if (!autorizado && clienteRutaId) {
      const rutaSnap = await db
        .collection(EMPRESAS_COLLECTION)
        .doc(apiUser.empresaId)
        .collection(RUTAS_SUBCOLLECTION)
        .doc(clienteRutaId)
        .get();
      autorizado = rutaSnap.exists && rutaSnap.data()?.adminId === apiUser.uid;
    }
  }

  if (!autorizado) {
    return NextResponse.json({ error: "Cliente fuera de tu alcance" }, { status: 403 });
  }

  const prestamos = await listUltimosPrestamosClienteUi(
    db,
    apiUser.empresaId,
    clienteId,
    3
  );

  return NextResponse.json({ prestamos });
}
