import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { aprobarSolicitudEntregaReporte } from "@/lib/solicitud-entrega-reporte-admin";

export async function POST(
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
  try {
    const result = await aprobarSolicitudEntregaReporte(
      db,
      apiUser.empresaId,
      apiUser.uid,
      solicitudId.trim()
    );
    return NextResponse.json({
      ok: true,
      monto: result.monto,
      rutaId: result.rutaId,
      reporteDiaId: result.reporteDiaId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al aprobar";
    const status =
      msg.includes("no encontrada") ||
      msg.includes("ya fue resuelta") ||
      msg.includes("No podés") ||
      msg.includes("administración") ||
      msg.includes("No hubo efectivo") ||
      msg.includes("ya no tenga")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
