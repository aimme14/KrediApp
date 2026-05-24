"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { getMessaging, getToken } from "firebase/messaging";
import { app } from "@/lib/firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function TrabajadorFcmRegistration() {
  const { user, profile } = useAuth();
  const registradoRef = useRef(false);

  useEffect(() => {
    if (!user || profile?.role !== "trabajador") return;
    if (registradoRef.current) return;
    if (!VAPID_KEY) return;
    if (!app) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    void (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const sw = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: sw,
        });
        if (!token) return;

        const idToken = await user.getIdToken();
        await fetch("/api/user/fcm-token-trabajador", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token }),
        });
        registradoRef.current = true;
      } catch (e) {
        console.warn("[TrabajadorFCM] Error al registrar token:", e);
      }
    })();
  }, [user, profile?.role]);

  return null;
}
