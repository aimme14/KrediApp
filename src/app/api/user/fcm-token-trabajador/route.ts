import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminMessaging } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { USERS_COLLECTION } from "@/lib/empresas-db";

const MAX_TOKENS = 12;

function topicEmpleado(empleadoUid: string): string {
  const safe = (s: string) =>
    String(s ?? "").trim().replace(/[^a-zA-Z0-9-_.~%]/g, "_");
  return `empleado_${safe(empleadoUid)}`;
}

export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores" }, { status: 403 });
  }

  const { token } = (await request.json()) as { token?: string };
  if (!token?.trim()) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const userRef = db.collection(USERS_COLLECTION).doc(apiUser.uid);
  const snap = await userRef.get();
  const tokens: string[] = Array.isArray(snap.data()?.fcmTokens)
    ? (snap.data()!.fcmTokens as string[])
    : [];

  if (!tokens.includes(token)) {
    tokens.unshift(token);
    if (tokens.length > MAX_TOKENS) tokens.splice(MAX_TOKENS);
    await userRef.set({ fcmTokens: tokens }, { merge: true });
  }

  const messaging = getAdminMessaging();
  const topic = topicEmpleado(apiUser.uid);
  try {
    await messaging.subscribeToTopic([token], topic);
  } catch (e) {
    console.warn("[fcm] subscribeToTopic empleado:", topic, e);
    return NextResponse.json(
      { ok: false, topic, subscribedTopic: false, error: "No se pudo suscribir al topic" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, topic, subscribedTopic: true });
}
