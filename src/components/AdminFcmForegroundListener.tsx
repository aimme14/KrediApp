"use client";

import { useEffect } from "react";
import { getMessaging, onMessage } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useGastoFcmCampanita } from "@/context/GastoFcmCampanitaContext";

/**
 * - Primer plano: `onMessage` recibe el push y actualiza la campanita.
 * - Segundo plano: el service worker envía `postMessage` (ver firebase-messaging-sw.js).
 */
export function AdminFcmForegroundListener() {
  const { profile } = useAuth();
  const { bumpFromFcm } = useGastoFcmCampanita();

  useEffect(() => {
    if (!app || profile?.role !== "admin") return;

    const messaging = getMessaging(app);
    const unsubscribe = onMessage(messaging, (payload) => {
      if (payload.data?.type !== "gasto_empleado") return;
      const title =
        payload.notification?.title?.trim() || "Nuevo gasto de un trabajador";
      const body = payload.notification?.body?.trim() || "";
      bumpFromFcm(title, body);
    });

    return () => unsubscribe();
  }, [profile?.role, bumpFromFcm]);

  useEffect(() => {
    if (profile?.role !== "admin") return;

    const onSwMessage = (event: MessageEvent) => {
      const d = event.data;
      if (d?.type === "KREDI_FCM_GASTO") {
        bumpFromFcm(
          typeof d.title === "string" ? d.title : "Nuevo gasto de un trabajador",
          typeof d.body === "string" ? d.body : ""
        );
      }
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    window.addEventListener("message", onSwMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      window.removeEventListener("message", onSwMessage);
    };
  }, [profile?.role, bumpFromFcm]);

  return null;
}
