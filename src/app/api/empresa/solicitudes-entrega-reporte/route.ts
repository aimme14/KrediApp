import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { listSolicitudesEntregaPendientesAdmin } from "@/lib/solicitud-entrega-reporte-admin";

/** GET: solicitudes pendientes de confirmación de entrega de reporte (admin de la ruta). */
export async function GET(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const db = getAdminFirestore();
  try {
    const items = await listSolicitudesEntregaPendientesAdmin(db, apiUser.empresaId, apiUser.uid);
    return NextResponse.json({
      solicitudes: items.map((s) => ({
        id: s.id,
        empleadoUid: s.empleadoUid,
        empleadoNombre: s.empleadoNombre,
        rutaId: s.rutaId,
        rutaNombre: s.rutaNombre,
        estado: s.estado,
        comentarioTrabajador: s.comentarioTrabajador,
        montoAlSolicitar: s.montoAlSolicitar,
        creadaEn: s.creadaEn?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar solicitudes";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
