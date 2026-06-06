import type { Message, Messaging } from "firebase-admin/messaging";

function topicEmpleado(empleadoUid: string): string {
  const safe = (s: string) =>
    String(s ?? "").trim().replace(/[^a-zA-Z0-9-_.~%]/g, "_");
  return `empleado_${safe(empleadoUid)}`;
}

export async function notifyEmpleadoSolicitudResuelta(
  messaging: Messaging,
  params: {
    empleadoUid: string;
    empresaId: string;
    clienteNombre: string;
    monto: number;
    aprobada: boolean;
    motivoRechazo: string | null;
  }
): Promise<void> {
  const { empleadoUid, clienteNombre, monto, aprobada, motivoRechazo } = params;

  const title = aprobada ? "✅ Préstamo aprobado" : "❌ Préstamo rechazado";
  const body = aprobada
    ? `El préstamo de $${monto.toLocaleString("es-CO")} para ${clienteNombre} fue aprobado`
    : `El préstamo para ${clienteNombre} fue rechazado${motivoRechazo ? `: ${motivoRechazo}` : ""}`;

  const collapseKey = `solicitud_prestamo_${empleadoUid}`;
  const type = aprobada ? "prestamo_aprobado" : "prestamo_rechazado";

  const message: Message = {
    topic: topicEmpleado(empleadoUid),
    notification: { title, body },
    android: {
      collapseKey,
      notification: {
        title,
        body,
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
        channelId: "krediapp_default",
      },
    },
    webpush: {
      headers: { Topic: collapseKey },
      notification: { title, body },
    },
    data: {
      type,
      clienteNombre,
      monto: String(monto),
      title,
      body,
      click_action: "/dashboard/trabajador/prestamo",
    },
  };

  await messaging.send(message);
}
