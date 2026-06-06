/**
 * Push al administrador: gastos, préstamos desembolsados y registros de cuota por trabajador.
 * Envío por topic FCM (misma suscripción que gastos): sin leer tokens por envío.
 */

import type { Messaging } from "firebase-admin/messaging";
import { topicGastosAdmin } from "@/lib/fcm-gasto-topic";

export type PayloadGastoEmpleadoFcm = {
  adminUid: string;
  empleadoNombre: string;
  monto: number;
  descripcion: string;
  gastoId: string;
  empresaId: string;
};

function formatMontoCOP(monto: number): string {
  const n = Math.round(monto * 100) / 100;
  return `$ ${n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export async function notifyAdminGastoEmpleado(
  messaging: Messaging,
  payload: PayloadGastoEmpleadoFcm
): Promise<void> {
  const { adminUid, empleadoNombre, monto, descripcion, gastoId, empresaId } =
    payload;
  if (!adminUid.trim() || !empresaId.trim()) return;

  const topic = topicGastosAdmin(empresaId, adminUid);

  const title = "Nuevo gasto de un trabajador";
  const motivo = descripcion.trim() || "Sin descripción";
  const body = `${empleadoNombre}: ${formatMontoCOP(monto)} — ${
    motivo.length > 90 ? `${motivo.slice(0, 87)}…` : motivo
  }`;

  try {
    await messaging.send({
      topic,
      android: { collapseKey: `gasto_${gastoId}` },
      webpush: { headers: { Topic: `gasto_${gastoId}` } },
      data: {
        title,
        body,
        type: "gasto_empleado",
        gastoId,
        empresaId,
        click_action: "/dashboard/admin/gastos",
      },
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[fcm] Push gasto empleado enviado al topic:", topic);
    }
  } catch (e) {
    console.warn("[fcm] notifyAdminGastoEmpleado falló (topic / API FCM / credenciales):", topic, e);
  }
}

export type PayloadPrestamoEmpleadoFcm = {
  adminUid: string;
  empresaId: string;
  empleadoNombre: string;
  clienteNombre: string;
  monto: number;
  prestamoId: string;
};

export async function notifyAdminPrestamoEmpleado(
  messaging: Messaging,
  payload: PayloadPrestamoEmpleadoFcm
): Promise<void> {
  const { adminUid, empresaId, empleadoNombre, clienteNombre, monto, prestamoId } =
    payload;
  if (!adminUid.trim() || !empresaId.trim()) return;

  const topic = topicGastosAdmin(empresaId, adminUid);
  const title = "Nuevo préstamo desembolsado";
  const body = truncateBody(
    `${empleadoNombre} · ${clienteNombre} — ${formatMontoCOP(monto)}`,
    180
  );

  try {
    await messaging.send({
      topic,
      android: { collapseKey: `prestamo_${prestamoId}` },
      webpush: { headers: { Topic: `prestamo_${prestamoId}` } },
      data: {
        title,
        body,
        type: "prestamo_empleado",
        empresaId,
        prestamoId,
        click_action: "/dashboard/admin/prestamo",
      },
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[fcm] Push préstamo empleado enviado al topic:", topic);
    }
  } catch (e) {
    console.warn("[fcm] notifyAdminPrestamoEmpleado falló:", topic, e);
  }
}

export type PayloadClienteEmpleadoFcm = {
  adminUid: string;
  empresaId: string;
  empleadoNombre: string;
  clienteNombre: string;
  clienteId: string;
};

export async function notifyAdminClienteEmpleado(
  messaging: Messaging,
  payload: PayloadClienteEmpleadoFcm
): Promise<void> {
  const { adminUid, empresaId, empleadoNombre, clienteNombre, clienteId } = payload;
  if (!adminUid.trim() || !empresaId.trim()) return;

  const topic = topicGastosAdmin(empresaId, adminUid);
  const title = "Nuevo cliente registrado";
  const body = truncateBody(`${empleadoNombre} · ${clienteNombre}`, 180);

  try {
    await messaging.send({
      topic,
      android: { collapseKey: `cliente_${clienteId}` },
      webpush: { headers: { Topic: `cliente_${clienteId}` } },
      data: {
        title,
        body,
        type: "cliente_empleado",
        empresaId,
        clienteId,
        click_action: "/dashboard/admin/cliente",
      },
    });
  } catch (e) {
    console.warn("[fcm] notifyAdminClienteEmpleado falló:", topic, e);
  }
}

const LABEL_NO_PAGO: Record<string, string> = {
  sin_fondos: "Sin fondos",
  no_estaba: "No estaba",
  promesa_pago: "Promesa de pago",
  otro: "Otro",
};

const LABEL_PERDIDA: Record<string, string> = {
  imposible_cobrar: "Imposible cobrar",
  cliente_perdido: "Cliente perdido",
  acuerdo_quita: "Acuerdo / quita",
  otro: "Otro",
};

export type PayloadSolicitudPrestamoFcm = {
  adminUid: string;
  empresaId: string;
  empleadoNombre: string;
  clienteNombre: string;
  monto: number;
  solicitudId: string;
};

export async function notifyAdminSolicitudPrestamo(
  messaging: Messaging,
  payload: PayloadSolicitudPrestamoFcm
): Promise<void> {
  const { adminUid, empresaId, empleadoNombre, clienteNombre, monto, solicitudId } =
    payload;
  if (!adminUid.trim() || !empresaId.trim()) return;

  const topic = topicGastosAdmin(empresaId, adminUid);
  const title = "Solicitud de préstamo";
  const body = truncateBody(
    `${empleadoNombre} · ${clienteNombre} — ${formatMontoCOP(monto)}`,
    180
  );

  try {
    await messaging.send({
      topic,
      android: { collapseKey: `sol_prestamo_${solicitudId}` },
      webpush: { headers: { Topic: `sol_prestamo_${solicitudId}` } },
      data: {
        title,
        body,
        type: "solicitud_prestamo",
        empresaId,
        solicitudId,
        click_action: "/dashboard/admin/solicitudes-prestamo",
      },
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[fcm] Push solicitud préstamo enviado al topic:", topic);
    }
  } catch (e) {
    console.warn("[fcm] notifyAdminSolicitudPrestamo falló:", topic, e);
  }
}

export type PayloadEntregaReporteFcm = {
  adminUid: string;
  empresaId: string;
  empleadoNombre: string;
  monto: number;
  solicitudId: string;
  rutaNombre: string;
};

export async function notifyAdminEntregaReporte(
  messaging: Messaging,
  payload: PayloadEntregaReporteFcm
): Promise<void> {
  const { adminUid, empresaId, empleadoNombre, monto, solicitudId, rutaNombre } =
    payload;
  if (!adminUid.trim() || !empresaId.trim()) return;

  const topic = topicGastosAdmin(empresaId, adminUid);
  const title = "Entrega de reporte pendiente";
  const body = truncateBody(
    `${empleadoNombre} · ${rutaNombre || "Ruta"} — ${formatMontoCOP(monto)}`,
    180
  );

  try {
    await messaging.send({
      topic,
      android: { collapseKey: `entrega_${solicitudId}` },
      webpush: { headers: { Topic: `entrega_${solicitudId}` } },
      data: {
        title,
        body,
        type: "entrega_reporte",
        empresaId,
        solicitudId,
        click_action: "/dashboard/admin/reportes-dia",
      },
    });
  } catch (e) {
    console.warn("[fcm] notifyAdminEntregaReporte falló:", topic, e);
  }
}

export type PayloadCuotaPrestamoFcm = {
  adminUid: string;
  empresaId: string;
  prestamoId: string;
  pagoId: string;
  clienteNombre: string;
  clienteId: string;
  tipoRegistro: "pago" | "no_pago" | "perdida";
  monto?: number;
  motivoCodigo?: string;
  metodoPago?: "efectivo" | "transferencia";
};

function truncateBody(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Notifica al admin cuando un **empleado** registra pago, no pago o pérdida sobre una cuota.
 * Usa el mismo topic que gastos (`topicGastosAdmin`).
 */
export async function notifyAdminCuotaPrestamo(
  messaging: Messaging,
  payload: PayloadCuotaPrestamoFcm
): Promise<void> {
  const {
    adminUid,
    empresaId,
    prestamoId,
    pagoId,
    clienteNombre,
    clienteId,
    tipoRegistro,
    monto,
    motivoCodigo,
    metodoPago,
  } = payload;

  if (!adminUid.trim() || !empresaId.trim()) return;

  const nombreCliente =
    clienteNombre.trim() || `Cliente ${clienteId.trim().slice(0, 8) || "—"}`;
  const topic = topicGastosAdmin(empresaId, adminUid);

  let title: string;
  let body: string;

  if (tipoRegistro === "pago") {
    title = "Cuota cobrada";
    const m =
      typeof monto === "number" && Number.isFinite(monto)
        ? formatMontoCOP(monto)
        : "—";
    const met =
      metodoPago === "transferencia" ? "transferencia" : "efectivo";
    body = truncateBody(`${nombreCliente} · Pagó ${m} (${met})`, 180);
  } else if (tipoRegistro === "no_pago") {
    title = "Cliente sin pago";
    const motivo =
      LABEL_NO_PAGO[motivoCodigo ?? ""] ?? LABEL_NO_PAGO.otro;
    body = truncateBody(`${nombreCliente} · No pagó — ${motivo}`, 180);
  } else {
    title = "Pérdida registrada";
    const m =
      typeof monto === "number" && Number.isFinite(monto)
        ? formatMontoCOP(monto)
        : "—";
    const motivo =
      LABEL_PERDIDA[motivoCodigo ?? ""] ?? LABEL_PERDIDA.otro;
    body = truncateBody(`${nombreCliente} · Pérdida ${m} — ${motivo}`, 180);
  }

  const query = `clienteId=${encodeURIComponent(clienteId.trim())}&prestamoId=${encodeURIComponent(prestamoId)}`;
  const clickPath = `/dashboard/admin/cobrar?${query}`;

  try {
    await messaging.send({
      topic,
      android: { collapseKey: `cuota_${pagoId}` },
      webpush: { headers: { Topic: `cuota_${pagoId}` } },
      data: {
        title,
        body,
        type: "cuota_prestamo",
        empresaId,
        prestamoId,
        pagoId,
        clienteId: clienteId.trim(),
        tipoRegistro,
        click_action: clickPath,
      },
    });
    console.log("[fcm] Push cuota préstamo ENVIADO. Topic:", topic, "tipo:", tipoRegistro);
  } catch (e) {
    console.error("[fcm] notifyAdminCuotaPrestamo ERROR:", topic, JSON.stringify(e));
  }
}
