import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  getMiEstadoSolicitudesEmpleado,
  type SolicitudEntregaReporteDoc,
} from "@/lib/solicitud-entrega-reporte-admin";

function serializeSolicitud(s: SolicitudEntregaReporteDoc | null) {
  if (!s) return null;
  return {
    id: s.id,
    empleadoUid: s.empleadoUid,
    empleadoNombre: s.empleadoNombre,
    rutaId: s.rutaId,
    rutaNombre: s.rutaNombre,
    adminId: s.adminId,
    estado: s.estado,
    comentarioTrabajador: s.comentarioTrabajador,
    montoAlSolicitar: s.montoAlSolicitar,
    creadaEn: s.creadaEn?.toISOString() ?? null,
    resueltaEn: s.resueltaEn?.toISOString() ?? null,
    resueltaPorUid: s.resueltaPorUid,
    motivoRechazo: s.motivoRechazo,
    montoEntregadoEfectivo: s.montoEntregadoEfectivo,
  };
}

/** GET: estado de solicitudes de entrega de reporte (pendiente y última rechazada). */
export async function GET(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores" }, { status: 403 });
  }

  const db = getAdminFirestore();
  try {
    const { pendiente, ultimaRechazada } = await getMiEstadoSolicitudesEmpleado(
      db,
      apiUser.empresaId,
      apiUser.uid
    );
    return NextResponse.json({
      pendiente: serializeSolicitud(pendiente),
      ultimaRechazada: serializeSolicitud(ultimaRechazada),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar solicitud";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
