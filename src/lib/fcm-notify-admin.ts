/**
 * Push al administrador: gastos operativos y registros de cuota por trabajador.
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
      notification: { title, body },
      data: {
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
      notification: { title, body },
      data: {
        type: "cuota_prestamo",
        empresaId,
        prestamoId,
        pagoId,
        clienteId: clienteId.trim(),
        tipoRegistro,
        click_action: clickPath,
      },
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[fcm] Push cuota préstamo enviado al topic:", topic);
    }
  } catch (e) {
    console.warn(
      "[fcm] notifyAdminCuotaPrestamo falló (topic / API FCM / credenciales):",
      topic,
      e
    );
  }
}
