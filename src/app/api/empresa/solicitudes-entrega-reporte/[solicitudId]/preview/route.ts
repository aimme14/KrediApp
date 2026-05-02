import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { buildCierreDiaSnapshot } from "@/lib/cierre-dia-snapshot";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";

/**
 * GET: previsualización del cierre del día (misma lógica que cobros del día del trabajador).
 * Solo administrador dueño de la solicitud; solo solicitudes pendientes.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ solicitudId: string }> }
) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { solicitudId } = await params;
  if (!solicitudId?.trim()) {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;
  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION)
    .doc(solicitudId.trim());

  const solSnap = await solRef.get();
  if (!solSnap.exists) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }

  const sol = solSnap.data() as Record<string, unknown>;
  if (sol.estado !== "pendiente") {
    return NextResponse.json(
      { error: "Solo se puede previsualizar una solicitud pendiente" },
      { status: 400 }
    );
  }
  if (sol.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const empleadoUid = typeof sol.empleadoUid === "string" ? sol.empleadoUid.trim() : "";
  const rutaId = typeof sol.rutaId === "string" ? sol.rutaId.trim() : "";
  if (!empleadoUid || !rutaId) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const fechaDia = fechaDiaColombiaHoy();

  try {
    const snapshot = await buildCierreDiaSnapshot(db, {
      empresaId,
      empleadoUid,
      rutaId,
      fechaDia,
    });

    return NextResponse.json({
      fechaDiaPreview: fechaDia,
      solicitud: {
        id: solicitudId.trim(),
        empleadoNombre:
          typeof sol.empleadoNombre === "string" && sol.empleadoNombre.trim()
            ? sol.empleadoNombre.trim()
            : "—",
        rutaNombre:
          typeof sol.rutaNombre === "string" && sol.rutaNombre.trim()
            ? sol.rutaNombre.trim()
            : "",
        rutaId,
        montoAlSolicitar:
          typeof sol.montoAlSolicitar === "number" ? sol.montoAlSolicitar : 0,
        comentarioTrabajador:
          typeof sol.comentarioTrabajador === "string" && sol.comentarioTrabajador.trim()
            ? sol.comentarioTrabajador.trim()
            : null,
      },
      snapshot,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al armar la vista previa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
