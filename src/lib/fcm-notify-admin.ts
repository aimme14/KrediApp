/**
 * Push al administrador cuando un empleado registra un gasto.
 * Envío por topic FCM: sin lectura de Firestore en el hot path (solo send).
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
