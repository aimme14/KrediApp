import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminMessaging } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { USERS_COLLECTION } from "@/lib/empresas-db";
import { topicGastosAdmin } from "@/lib/fcm-gasto-topic";

const MAX_TOKENS = 12;

/**
 * Registra el token FCM del dispositivo del admin para recibir push (p. ej. gastos del equipo).
 */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser || apiUser.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 4096) {
    return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection(USERS_COLLECTION).doc(apiUser.uid);

  const snap = await ref.get();
  const prev = snap.data()?.fcmTokens;
  const list = Array.isArray(prev)
    ? (prev as unknown[]).filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];

  const merged = Array.from(new Set([token, ...list])).slice(0, MAX_TOKENS);

  await ref.set(
    {
      fcmTokens: merged,
      fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  let subscribedTopic = false;
  let topicName = "";
  try {
    const messaging = getAdminMessaging();
    topicName = topicGastosAdmin(apiUser.empresaId, apiUser.uid);
    await messaging.subscribeToTopic([token], topicName);
    subscribedTopic = true;
  } catch (e) {
    console.warn("[fcm] subscribeToTopic gastos:", e);
  }

  return NextResponse.json({
    ok: true,
    topic: topicName,
    subscribedTopic,
  });
}
