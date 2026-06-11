import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Messaging } from "firebase-admin/messaging";
import type { ApiUser } from "@/lib/api-auth";
import { USERS_COLLECTION } from "@/lib/empresas-db";
import { resolveAdminFcmTopic } from "@/lib/fcm-topics";

export const MAX_FCM_TOKENS = 12;

export function parseFcmTokens(prev: unknown): string[] {
  if (!Array.isArray(prev)) return [];
  return prev.filter((t): t is string => typeof t === "string" && t.length > 0);
}

export function mergeFcmToken(list: string[], token: string): string[] {
  return Array.from(new Set([token, ...list])).slice(0, MAX_FCM_TOKENS);
}

export function removeFcmToken(list: string[], token: string): string[] {
  return list.filter((t) => t !== token);
}

export type FcmTokenRegistryResult = {
  topic: string;
  topicActionOk: boolean;
};

export async function registerAdminFcmToken(
  db: Firestore,
  messaging: Messaging,
  apiUser: ApiUser,
  token: string
): Promise<FcmTokenRegistryResult> {
  const ref = db.collection(USERS_COLLECTION).doc(apiUser.uid);
  const snap = await ref.get();
  const list = parseFcmTokens(snap.data()?.fcmTokens);
  const merged = mergeFcmToken(list, token);

  await ref.set(
    {
      fcmTokens: merged,
      fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const topic = resolveAdminFcmTopic(apiUser);
  let topicActionOk = false;
  try {
    await messaging.subscribeToTopic([token], topic);
    topicActionOk = true;
    console.log(
      "[fcm] subscribeToTopic OK. Topic:",
      topic,
      "token:",
      token.slice(0, 20) + "..."
    );
  } catch (e) {
    console.warn("[fcm] subscribeToTopic gastos:", e);
  }

  return { topic, topicActionOk };
}

export async function unregisterAdminFcmToken(
  db: Firestore,
  messaging: Messaging,
  apiUser: ApiUser,
  token: string
): Promise<FcmTokenRegistryResult> {
  const ref = db.collection(USERS_COLLECTION).doc(apiUser.uid);
  const snap = await ref.get();
  const list = parseFcmTokens(snap.data()?.fcmTokens);
  const next = removeFcmToken(list, token);

  if (next.length !== list.length) {
    await ref.set(
      {
        fcmTokens: next,
        fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const topic = resolveAdminFcmTopic(apiUser);
  let topicActionOk = false;
  try {
    await messaging.unsubscribeFromTopic([token], topic);
    topicActionOk = true;
    console.log(
      "[fcm] unsubscribeFromTopic OK. Topic:",
      topic,
      "token:",
      token.slice(0, 20) + "..."
    );
  } catch (e) {
    console.warn("[fcm] unsubscribeFromTopic gastos:", e);
  }

  return { topic, topicActionOk };
}
