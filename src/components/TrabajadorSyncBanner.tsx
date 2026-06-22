"use client";

import { useTrabajadorLista } from "@/context/TrabajadorListaContext";

export function TrabajadorSyncBanner() {
  const { datosSyncEstado } = useTrabajadorLista();
  if (datosSyncEstado === "synced") return null;
  const offline = datosSyncEstado === "offline";
  const msg = offline
    ? "Sin conexión — los datos se actualizarán cuando vuelvas a tener conexión"
    : "Actualizando datos…";
  return (
    <div
      className={`trabajador-sync-banner${offline ? " trabajador-sync-banner--offline" : ""}`}
      role="status"
      aria-live="polite"
    >
      {msg}
    </div>
  );
}
