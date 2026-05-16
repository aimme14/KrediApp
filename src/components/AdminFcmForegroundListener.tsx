"use client";

import { useEffect, useRef } from "react";
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
  if (t === "prestamo_empleado") return "cuota";
  if (t === "cliente_empleado") return "gasto";
  return null;
}

/**
 * - Primer plano: `onMessage` recibe el push y actualiza la campanita.
 * - Segundo plano: el service worker envía `postMessage` (ver firebase-messaging-sw.js).
 */
export function AdminFcmForegroundListener() {
  const { profile } = useAuth();
  const { bumpOperativoFromFcm } = useGastoFcmCampanita();
  const processedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!app || profile?.role !== "admin") return;

    const processedIds = processedIdsRef.current;
    const messaging = getMessaging(app);
    const unsubscribe = onMessage(messaging, (payload) => {
      const msgId =
        payload.messageId ??
        payload.data?.gastoId ??
        payload.data?.pagoId ??
        Date.now().toString();
      if (processedIds.has(msgId)) return;
      processedIds.add(msgId);

      const kind = kindFromFcmDataType(payload.data?.type);
      if (!kind) return;
      const title =
        payload.data?.title?.trim() ||
        (kind === "cuota" ? "Cuota" : "Nuevo gasto");
      const body = payload.data?.body?.trim() || "";
      bumpOperativoFromFcm(kind, title, body);
    });

    return () => unsubscribe();
  }, [profile?.role, bumpOperativoFromFcm]);

  useEffect(() => {
    if (profile?.role !== "admin") return;

    const processedIds = processedIdsRef.current;

    const msgIdFromSw = (d: Record<string, unknown>) =>
      (typeof d.messageId === "string" && d.messageId) ||
      (typeof d.gastoId === "string" && d.gastoId) ||
      (typeof d.pagoId === "string" && d.pagoId) ||
      null;

    const onSwMessage = (event: MessageEvent) => {
      const d = event.data;
      const msgId = d && typeof d === "object" ? msgIdFromSw(d) : null;
      if (msgId) {
        if (processedIds.has(msgId)) return;
        processedIds.add(msgId);
      }

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
        return;
      }
      if (d?.type === "KREDI_FCM_PRESTAMO") {
        bumpOperativoFromFcm(
          "cuota",
          typeof d.title === "string"
            ? d.title
            : "Nuevo préstamo desembolsado",
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
