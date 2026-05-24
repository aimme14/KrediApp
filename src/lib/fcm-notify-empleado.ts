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

  const message: Message = {
    topic: topicEmpleado(empleadoUid),
    notification: { title, body },
    data: {
      type: aprobada ? "prestamo_aprobado" : "prestamo_rechazado",
      clienteNombre,
      monto: String(monto),
      title,
      body,
    },
    android: { collapseKey: `solicitud_prestamo_${empleadoUid}` },
    webpush: {
      headers: { Topic: `solicitud_prestamo_${empleadoUid}` },
      notification: { title, body },
    },
  };

  await messaging.send(message);
}
