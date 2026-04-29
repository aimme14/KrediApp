"use client";

import { useEffect } from "react";
import { getMessaging, onMessage } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  useGastoFcmCampanita,
  type OperativoFcmKind,
} from "@/context/GastoFcmCampanitaContext";

function kindFromFcmDataType(
  t: string | undefined
): OperativoFcmKind | null {
  if (t === "gasto_empleado") return "gasto";
  if (t === "cuota_prestamo") return "cuota";
  return null;
}

/**
 * - Primer plano: `onMessage` recibe el push y actualiza la campanita.
 * - Segundo plano: el service worker envía `postMessage` (ver firebase-messaging-sw.js).
 */
export function AdminFcmForegroundListener() {
  const { profile } = useAuth();
  const { bumpOperativoFromFcm } = useGastoFcmCampanita();

  useEffect(() => {
    if (!app || profile?.role !== "admin") return;

    const messaging = getMessaging(app);
    const unsubscribe = onMessage(messaging, (payload) => {
      const kind = kindFromFcmDataType(payload.data?.type);
      if (!kind) return;
      const title =
        payload.notification?.title?.trim() ||
        (kind === "cuota" ? "Cuota" : "Nuevo gasto de un trabajador");
      const body = payload.notification?.body?.trim() || "";
      bumpOperativoFromFcm(kind, title, body);
    });

    return () => unsubscribe();
  }, [profile?.role, bumpOperativoFromFcm]);

  useEffect(() => {
    if (profile?.role !== "admin") return;

    const onSwMessage = (event: MessageEvent) => {
      const d = event.data;
      if (d?.type === "KREDI_FCM_OPERATIVO") {
        const kind: OperativoFcmKind =
          d.kind === "cuota" ? "cuota" : "gasto";
        bumpOperativoFromFcm(
          kind,
          typeof d.title === "string"
            ? d.title
            : kind === "cuota"
              ? "Cuota"
              : "Nuevo gasto de un trabajador",
          typeof d.body === "string" ? d.body : ""
        );
        return;
      }
      if (d?.type === "KREDI_FCM_GASTO") {
        bumpOperativoFromFcm(
          "gasto",
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
  }, [profile?.role, bumpOperativoFromFcm]);

  return null;
}
