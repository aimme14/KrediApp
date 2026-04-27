import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { rechazarSolicitudEntregaReporte } from "@/lib/solicitud-entrega-reporte-admin";

const MAX_MOTIVO = 500;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ solicitudId: string }> }
) {
  const apiUser = await getApiUser(request);
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

  let motivo: string | null = null;
  const body = (await request.json().catch(() => ({}))) as { motivo?: unknown };
  if (body?.motivo !== undefined && body.motivo !== null) {
    if (typeof body.motivo !== "string") {
      return NextResponse.json({ error: "El motivo debe ser texto" }, { status: 400 });
    }
    const t = body.motivo.trim();
    if (t.length > MAX_MOTIVO) {
      return NextResponse.json(
        { error: `El motivo no puede superar ${MAX_MOTIVO} caracteres` },
        { status: 400 }
      );
    }
    motivo = t.length > 0 ? t : null;
  }

  const db = getAdminFirestore();
  try {
    await rechazarSolicitudEntregaReporte(
      db,
      apiUser.empresaId,
      apiUser.uid,
      solicitudId.trim(),
      motivo
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al rechazar";
    const status =
      msg.includes("no encontrada") ||
      msg.includes("ya fue resuelta") ||
      msg.includes("No podés")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
