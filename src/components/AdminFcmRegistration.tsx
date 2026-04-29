"use client";

import { useEffect, useRef } from "react";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

/**
 * Solicita permiso de notificaciones y registra el token FCM del admin en Firestore (vía API).
 * Sin token registrado, el servidor no puede enviar push al registrar un gasto del trabajador.
 */
export function AdminFcmRegistration() {
  const { user, profile } = useAuth();
  const tried = useRef(false);

  useEffect(() => {
    if (!app || !user || profile?.role !== "admin") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const run = async () => {
      if (tried.current) return;
      const firebaseApp = app;
      if (!firebaseApp) return;
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
      if (!vapidKey) return;

      const supported = await isSupported().catch(() => false);
      if (!supported || cancelled) return;

      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted" || cancelled) return;

        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
          scope: "/",
        });
        await registration.update();

        const messaging = getMessaging(firebaseApp);
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        if (!token || cancelled) return;

        tried.current = true;
        const idToken = await user.getIdToken();
        const res = await fetch("/api/user/fcm-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          tried.current = false;
        }
      } catch {
        /* permiso denegado, modo incógnito, etc. */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user, profile?.role]);

  return null;
}
