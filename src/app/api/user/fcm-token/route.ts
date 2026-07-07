import { NextRequest, NextResponse } from "next/server";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

import { getAdminFirestore, getAdminMessaging } from "@/lib/firebase-admin";

import { getApiUser } from "@/lib/api-auth";

import {

  registerAdminFcmToken,

  unregisterAdminFcmToken,

} from "@/lib/fcm-token-registry";



function parseTokenBody(body: unknown): string | null {

  const token =

    typeof body === "object" &&

    body !== null &&

    typeof (body as { token?: unknown }).token === "string"

      ? (body as { token: string }).token.trim()

      : "";

  if (!token || token.length > 4096) return null;

  return token;

}



async function parseJsonBody(request: NextRequest): Promise<unknown | null> {

  try {

    return await request.json();

  } catch {

    return null;

  }

}



/**

 * Registra el token FCM del dispositivo del admin para recibir push (p. ej. gastos del equipo).

 */

export async function POST(request: NextRequest) {

  const apiUser = await getApiUser(request);

  if (!apiUser || !isAdminPanelApiUser(apiUser)) {

    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  }



  const body = await parseJsonBody(request);

  if (body === null) {

    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  }



  const token = parseTokenBody(body);

  if (!token) {

    return NextResponse.json({ error: "Token inválido" }, { status: 400 });

  }



  const db = getAdminFirestore();

  const messaging = getAdminMessaging();

  const { topic, topicActionOk } = await registerAdminFcmToken(

    db,

    messaging,

    apiUser,

    token

  );



  return NextResponse.json({

    ok: true,

    topic,

    subscribedTopic: topicActionOk,

  });

}



/**

 * Desuscribe el token FCM del topic del admin y lo quita de Firestore (p. ej. al cerrar sesión).

 */

export async function DELETE(request: NextRequest) {

  const apiUser = await getApiUser(request);

  if (!apiUser || !isAdminPanelApiUser(apiUser)) {

    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  }



  const body = await parseJsonBody(request);

  if (body === null) {

    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  }



  const token = parseTokenBody(body);

  if (!token) {

    return NextResponse.json({ error: "Token inválido" }, { status: 400 });

  }



  const db = getAdminFirestore();

  const messaging = getAdminMessaging();

  const { topic, topicActionOk } = await unregisterAdminFcmToken(

    db,

    messaging,

    apiUser,

    token

  );



  return NextResponse.json({

    ok: true,

    topic,

    unsubscribedTopic: topicActionOk,

  });

}

