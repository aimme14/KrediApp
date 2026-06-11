import type { ApiUser } from "@/lib/api-auth";
import { topicGastosAdmin } from "@/lib/fcm-gasto-topic";

/** Topic FCM de notificaciones operativas para un admin. */
export function resolveAdminFcmTopic(apiUser: Pick<ApiUser, "empresaId" | "uid">): string {
  return topicGastosAdmin(apiUser.empresaId, apiUser.uid);
}
