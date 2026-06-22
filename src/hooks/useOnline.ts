"use client";

import { useState, useEffect } from "react";

export const OFFLINE_MSG = "Sin conexión — reconéctate para continuar";

export const OFFLINE_BANNER_MSG =
  "Sin conexión — no puedes realizar cambios hasta reconectarte";

/**
 * Devuelve true si el navegador tiene conexión a internet.
 * Se actualiza automáticamente cuando cambia el estado de red.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

/** Guardia para handlers de escritura. Devuelve false si no hay conexión. */
export function guardOfflineWrite(
  online: boolean,
  setError?: (msg: string) => void
): boolean {
  if (online) return true;
  setError?.(OFFLINE_MSG);
  return false;
}
