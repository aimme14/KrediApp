import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { crearSolicitudEntregaReporte } from "@/lib/solicitud-entrega-reporte-admin";

const MAX_COMENTARIO_REPORTE = 2000;

/**
 * POST: el trabajador solicita entregar el reporte diario (efectivo de su caja → base de la ruta).
 * El traspaso real ocurre cuando el administrador aprueba la solicitud.
 */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores" }, { status: 403 });
  }

  let comentarioTrimmed: string | null = null;
  const body = (await request.json().catch(() => ({}))) as { comentario?: unknown };
  if (body?.comentario !== undefined && body.comentario !== null) {
    if (typeof body.comentario !== "string") {
      return NextResponse.json({ error: "El comentario debe ser texto" }, { status: 400 });
    }
    const t = body.comentario.trim();
    if (t.length > MAX_COMENTARIO_REPORTE) {
      return NextResponse.json(
        { error: `El comentario no puede superar ${MAX_COMENTARIO_REPORTE} caracteres` },
        { status: 400 }
      );
    }
    comentarioTrimmed = t.length > 0 ? t : null;
  }

  const db = getAdminFirestore();
  try {
    const result = await crearSolicitudEntregaReporte(
      db,
      apiUser.empresaId,
      apiUser.uid,
      comentarioTrimmed
    );
    return NextResponse.json({
      ok: true,
      solicitudId: result.solicitudId,
      montoAlSolicitar: result.montoAlSolicitar,
      rutaId: result.rutaId,
      mensaje:
        "Tu solicitud fue enviada al administrador. El efectivo se pasará a la base de la ruta cuando confirme la entrega.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al solicitar entrega de reporte";
    const status =
      msg.includes("No hay efectivo") ||
      msg.includes("Ya enviaste") ||
      msg.includes("No tienes") ||
      msg.includes("no tiene administrador")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
