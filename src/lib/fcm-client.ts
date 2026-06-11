import type { User } from "firebase/auth";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { app } from "@/lib/firebase";

/**
 * Revoca el token FCM del dispositivo actual para el admin autenticado.
 * Debe llamarse antes de firebaseSignOut para que el Bearer siga siendo válido.
 */
export async function revokeAdminFcmOnDevice(user: User): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey || !app) return;

  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
  } catch {
    return;
  }

  const messaging = getMessaging(app);
  let token = "";
  try {
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return;
  }

  if (!token) return;

  const idToken = await user.getIdToken();
  const res = await fetch("/api/user/fcm-token", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `FCM revoke failed (${res.status})`);
  }
}
