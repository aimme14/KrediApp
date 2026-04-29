"use client";

import { useEffect, useRef } from "react";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const LOG = "[KrediApp FCM]";

/**
 * Solicita permiso de notificaciones, registra token FCM y suscribe al topic de gastos (vía API).
 * Sin VAPID (.env) este componente sale sin hacer fetch — por eso no verás /api/user/fcm-token en Red.
 */
export function AdminFcmRegistration() {
  const { user, profile } = useAuth();
  const lock = useRef(false);

  useEffect(() => {
    if (!app || !user || profile?.role !== "admin") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const run = async () => {
      if (lock.current) return;
      const firebaseApp = app;
      if (!firebaseApp) return;

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
      if (!vapidKey) {
        console.warn(
          `${LOG} No hay NEXT_PUBLIC_FIREBASE_VAPID_KEY. Añádela en .env.local (Firebase Console → ⚙️ → Cloud Messaging → Certificados Web Push) y reinicia "npm run dev".`
        );
        return;
      }

      const supported = await isSupported().catch(() => false);
      if (!supported || cancelled) {
        if (!supported) {
          console.warn(`${LOG} Este navegador no soporta Firebase Messaging en web.`);
        }
        return;
      }

      lock.current = true;
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          console.warn(`${LOG} Permiso de notificaciones: "${perm}". Actívalo en la configuración del sitio (icono candado).`);
          return;
        }

        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
          { scope: "/" }
        );
        await registration.update();

        const messaging = getMessaging(firebaseApp);
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });

        if (!token || cancelled) {
          if (!token) console.warn(`${LOG} getToken devolvió vacío (revisa Service Worker y proyecto Firebase).`);
          return;
        }

        const idToken = await user.getIdToken();
        const res = await fetch("/api/user/fcm-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          subscribedTopic?: boolean;
          topic?: string;
          error?: string;
        };

        if (!res.ok) {
          console.warn(`${LOG} POST /api/user/fcm-token falló`, res.status, data);
          return;
        }

        if (data.subscribedTopic === false) {
          console.warn(
            `${LOG} Token guardado pero subscribeToTopic falló en servidor. Revisa logs del servidor y API FCM en Google Cloud. Topic esperado:`,
            data.topic ?? "(vacío)"
          );
        } else {
          console.info(`${LOG} Registro OK. Topic:`, data.topic ?? "—", "subscribedTopic:", data.subscribedTopic);
        }
      } catch (e) {
        console.warn(`${LOG}`, e);
      } finally {
        lock.current = false;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user, profile?.role]);

  return null;
}
