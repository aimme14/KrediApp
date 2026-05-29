"use client";

import { useEffect, useRef } from "react";
import { getMessaging, onMessage } from "firebase/messaging";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  useGastoFcmCampanita,
  type OperativoFcmKind,
} from "@/context/GastoFcmCampanitaContext";
import { esDiaActualColombia } from "@/lib/colombia-day-bounds";

function kindFromFcmDataType(t: string | undefined): OperativoFcmKind | null {
  if (t === "gasto_empleado") return "gasto";
  if (t === "cuota_prestamo") return "cuota";
  if (t === "prestamo_empleado") return "cuota";
  if (t === "solicitud_prestamo") return "cuota";
  if (t === "cliente_empleado") return "gasto";
  return null;
}

// Extrae el ID de negocio del payload FCM (no el messageId de Firebase)
function businessIdFromData(data: Record<string, string> | undefined): string | null {
  if (!data) return null;
  return data.gastoId ?? data.pagoId ?? data.clienteId ?? data.prestamoId ?? data.solicitudId ?? null;
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
        (typeof d.solicitudId === "string" && d.solicitudId) ||
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

  // ── Notificaciones pendientes en IndexedDB (background sin cliente visible) ─
  useEffect(() => {
    if (profile?.role !== "admin") return;

    const leerPendientes = () => {
      try {
        const req = indexedDB.open("krediapp_fcm", 1);
        req.onupgradeneeded = (e) => {
          (e.target as IDBOpenDBRequest).result.createObjectStore("pendientes", {
            keyPath: "id",
          });
        };
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("pendientes")) return;
          const tx = db.transaction("pendientes", "readwrite");
          const store = tx.objectStore("pendientes");
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const pendientes = getAll.result as Array<{
              id: string;
              title: string;
              body: string;
              kind: string;
              at: number;
            }>;
            if (pendientes.length === 0) return;
            const vigentes = pendientes.filter((n) => esDiaActualColombia(n.at ?? 0));
            const expirados = pendientes.filter((n) => !esDiaActualColombia(n.at ?? 0));
            for (const n of expirados) {
              store.delete(n.id);
            }
            const processed = processedIdsRef.current;
            for (const n of vigentes) {
              const key = `biz:${n.id}`;
              if (processed.has(key)) {
                store.delete(n.id);
                continue;
              }
              processed.add(key);
              const kind: OperativoFcmKind = n.kind === "cuota" ? "cuota" : "gasto";
              bumpOperativoFromFcm(kind, n.title, n.body);
              store.delete(n.id);
            }
          };
        };
      } catch (e) {
        console.warn("[FCM] No se pudo leer pendientes:", e);
      }
    };

    leerPendientes();

    const onVisible = () => {
      if (document.visibilityState === "visible") leerPendientes();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [profile?.role, bumpOperativoFromFcm]);

  return null;
}
