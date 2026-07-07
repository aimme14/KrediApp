import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  SOLICITUDES_PRESTAMO_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { rechazarSolicitudPrestamo } from "@/lib/solicitud-prestamo-empleado";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

const MAX_MOTIVO = 500;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id: solicitudId } = await params;
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
  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .doc(solicitudId.trim());

  const solSnap = await solRef.get();
  if (!solSnap.exists) {
    return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  }
  const sol = solSnap.data() as Record<string, unknown>;

  try {
    await rechazarSolicitudPrestamo(
      db,
      apiUser.empresaId,
      apiUser.uid,
      solicitudId.trim(),
      motivo
    );

    void (async () => {
      try {
        const { getAdminMessaging } = await import("@/lib/firebase-admin");
        const { notifyEmpleadoSolicitudResuelta } = await import("@/lib/fcm-notify-empleado");
        await notifyEmpleadoSolicitudResuelta(getAdminMessaging(), {
          empleadoUid: typeof sol.empleadoUid === "string" ? sol.empleadoUid : "",
          empresaId: apiUser.empresaId,
          clienteNombre: typeof sol.clienteNombre === "string" ? sol.clienteNombre : "",
          monto: typeof sol.monto === "number" ? sol.monto : 0,
          aprobada: false,
          motivoRechazo: motivo,
        });
      } catch (e) {
        console.warn("[fcm] notify empleado rechazo:", e);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al rechazar";
    const status =
      msg.includes("no encontrada") ||
      msg.includes("ya fue resuelta") ||
      msg.includes("administración")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
