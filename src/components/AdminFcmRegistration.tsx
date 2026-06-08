"use client";

import { useEffect, useRef } from "react";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  useGastoFcmCampanita,
  type OperativoFcmKind,
} from "@/context/GastoFcmCampanitaContext";

const LOG = "[angry birds FCM]";

const TIPOS_OPERATIVOS_FCM = [
  "gasto_empleado",
  "prestamo_empleado",
  "cliente_empleado",
  "cuota_prestamo",
] as const;

/**
 * Solicita permiso de notificaciones, registra token FCM y suscribe al topic de gastos (vía API).
 * En foreground, alimenta la campanita con avisos operativos efímeros (sin lecturas extra en Firestore).
 */
export function AdminFcmRegistration() {
  const { user, profile } = useAuth();
  const { addFcmItem } = useGastoFcmCampanita();
  const lock = useRef(false);
  const addFcmItemRef = useRef(addFcmItem);

  addFcmItemRef.current = addFcmItem;

  useEffect(() => {
    if (!app || !user || profile?.role !== "admin") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let unsubMessage: (() => void) | undefined;

    const run = async () => {
      if (lock.current) return;

      await new Promise((r) => setTimeout(r, 1500));

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
          console.warn(
            `${LOG} Permiso de notificaciones: "${perm}". Actívalo en la configuración del sitio (icono candado).`
          );
          return;
        }

        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
          { scope: "/" }
        );
        await registration.update();

        const messaging = getMessaging(firebaseApp);
        let token = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            token = await getToken(messaging, {
              vapidKey,
              serviceWorkerRegistration: registration,
            });
            if (token) break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (msg.includes("IDBDatabase") || msg.includes("database connection")) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              continue;
            }
            if (attempt === 2) throw e;
          }
        }

        if (!token || cancelled) {
          if (!token) {
            console.warn(
              `${LOG} getToken devolvió vacío (revisa Service Worker y proyecto Firebase).`
            );
          }
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
          console.info(
            `${LOG} Registro OK. Topic:`,
            data.topic ?? "—",
            "subscribedTopic:",
            data.subscribedTopic
          );
        }

        if (cancelled) return;

        unsubMessage = onMessage(messaging, (payload) => {
          const data = payload.data ?? {};
          const type = data.type ?? "";

          if (
            !TIPOS_OPERATIVOS_FCM.includes(
              type as (typeof TIPOS_OPERATIVOS_FCM)[number]
            )
          ) {
            return;
          }

          const kind: OperativoFcmKind =
            type === "gasto_empleado" || type === "cliente_empleado"
              ? "gasto"
              : "cuota";

          const entityId =
            data.gastoId ??
            data.prestamoId ??
            data.pagoId ??
            data.clienteId ??
            crypto.randomUUID();

          const title = data.title ?? payload.notification?.title ?? "Notificación";
          const body = data.body ?? payload.notification?.body ?? "";

          addFcmItemRef.current({
            id: `fcm-${entityId}`,
            kind,
            title,
            body,
            at: Date.now(),
            href: data.click_action ?? undefined,
          });
        });
      } catch (e) {
        console.warn(`${LOG}`, e);
      } finally {
        lock.current = false;
      }
    };

    void run();
    return () => {
      cancelled = true;
      unsubMessage?.();
    };
  }, [user, profile?.role]);

  return null;
}
