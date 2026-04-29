/**
 * Envía push al administrador cuando un empleado registra un gasto.
 * Una lectura de `users/{adminUid}` para obtener `fcmTokens`; el resto son datos ya en memoria del POST.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { Messaging } from "firebase-admin/messaging";
import { USERS_COLLECTION } from "@/lib/empresas-db";

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
  db: Firestore,
  messaging: Messaging,
  payload: PayloadGastoEmpleadoFcm
): Promise<void> {
  const { adminUid, empleadoNombre, monto, descripcion, gastoId, empresaId } = payload;
  if (!adminUid.trim()) return;

  const adminSnap = await db.collection(USERS_COLLECTION).doc(adminUid).get();
  if (!adminSnap.exists) return;

  const raw = adminSnap.data()?.fcmTokens;
  const tokens = Array.from(
    new Set(
      Array.isArray(raw)
        ? (raw as unknown[]).filter((t): t is string => typeof t === "string" && t.length > 0)
        : []
    )
  );
  if (tokens.length === 0) return;

  const title = "Nuevo gasto de un trabajador";
  const motivo = descripcion.trim() || "Sin descripción";
  const body = `${empleadoNombre}: ${formatMontoCOP(monto)} — ${motivo.length > 90 ? `${motivo.slice(0, 87)}…` : motivo}`;

  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        type: "gasto_empleado",
        gastoId,
        empresaId,
        click_action: "/dashboard/admin/gastos",
      },
    });
    if (res.failureCount > 0) {
      const invalid = new Set<string>();
      const staleCodes = new Set([
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
      ]);
      res.responses.forEach((r, i) => {
        if (!r.success && r.error?.code && staleCodes.has(r.error.code)) {
          invalid.add(tokens[i]);
        }
      });
      if (invalid.size > 0) {
        const kept = tokens.filter((t) => !invalid.has(t));
        await db.collection(USERS_COLLECTION).doc(adminUid).set(
          { fcmTokens: kept },
          { merge: true }
        );
      }
    }
  } catch (e) {
    console.warn("[fcm] notifyAdminGastoEmpleado:", e);
  }
}
