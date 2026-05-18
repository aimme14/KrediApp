"use client";

import { useEffect, useRef } from "react";
import { getMessaging, onMessage } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  useGastoFcmCampanita,
  type OperativoFcmKind,
} from "@/context/GastoFcmCampanitaContext";

function kindFromFcmDataType(t: string | undefined): OperativoFcmKind | null {
  if (t === "gasto_empleado") return "gasto";
  if (t === "cuota_prestamo") return "cuota";
  if (t === "prestamo_empleado") return "cuota";
  if (t === "cliente_empleado") return "gasto";
  return null;
}

// Extrae el ID de negocio del payload FCM (no el messageId de Firebase)
function businessIdFromData(data: Record<string, string> | undefined): string | null {
  if (!data) return null;
  return data.gastoId ?? data.pagoId ?? data.clienteId ?? data.prestamoId ?? null;
}

export function AdminFcmForegroundListener() {
  const { profile } = useAuth();
  const { bumpOperativoFromFcm } = useGastoFcmCampanita();
  // Set compartido entre los dos listeners — clave: "fg:{id}" o "sw:{id}"
  const processedIdsRef = useRef(new Set<string>());

  // ── Listener foreground (onMessage) ──────────────────────────────────────
  useEffect(() => {
    if (!app || profile?.role !== "admin") return;

    const processed = processedIdsRef.current;
    const messaging = getMessaging(app);

    const unsub = onMessage(messaging, (payload) => {
      const bizId = businessIdFromData(payload.data as Record<string, string> | undefined);
      // Clave compartida con el SW — si el SW ya lo procesó, ignorar
      const key = bizId ? `biz:${bizId}` : `fg:${payload.messageId ?? Date.now()}`;

      if (processed.has(key)) return;
      processed.add(key);

      const kind = kindFromFcmDataType(payload.data?.type);
      if (!kind) return;

      const title = payload.data?.title?.trim() || (kind === "cuota" ? "Cuota" : "Nuevo gasto");
      const body = payload.data?.body?.trim() || "";
      bumpOperativoFromFcm(kind, title, body);
    });

    return () => unsub();
  }, [profile?.role, bumpOperativoFromFcm]);

  // ── Listener background (postMessage desde SW) ────────────────────────────
  useEffect(() => {
    if (profile?.role !== "admin") return;

    const processed = processedIdsRef.current;

    const onSwMessage = (event: MessageEvent) => {
      const d = event.data as Record<string, unknown> | null;
      if (!d) return;

      // Extraer ID de negocio enviado por el SW
      const bizId =
        (typeof d.gastoId === "string" && d.gastoId) ||
        (typeof d.pagoId === "string" && d.pagoId) ||
        (typeof d.clienteId === "string" && d.clienteId) ||
        (typeof d.prestamoId === "string" && d.prestamoId) ||
        null;

      // Clave compartida con onMessage
      const key = bizId ? `biz:${bizId}` : `sw:${Date.now()}`;

      if (bizId && processed.has(key)) return;
      if (bizId) processed.add(key);

      if (d.type === "KREDI_FCM_OPERATIVO" || d.type === "KREDI_FCM_GASTO") {
        const kind: OperativoFcmKind = d.kind === "cuota" ? "cuota" : "gasto";
        bumpOperativoFromFcm(
          kind,
          typeof d.title === "string" ? d.title : kind === "cuota" ? "Cuota" : "Nuevo gasto",
          typeof d.body === "string" ? d.body : ""
        );
        return;
      }

      if (d.type === "KREDI_FCM_PRESTAMO") {
        bumpOperativoFromFcm(
          "cuota",
          typeof d.title === "string" ? d.title : "Nuevo préstamo desembolsado",
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
