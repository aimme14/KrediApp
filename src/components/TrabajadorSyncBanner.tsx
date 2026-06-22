"use client";

import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { OFFLINE_BANNER_MSG, useOnline } from "@/hooks/useOnline";

export function TrabajadorSyncBanner() {
  const { datosSyncEstado } = useTrabajadorLista();
  const online = useOnline();

  if (!online) {
    return (
      <div
        className="trabajador-sync-banner trabajador-sync-banner--offline"
        role="alert"
        aria-live="assertive"
      >
        {OFFLINE_BANNER_MSG}
      </div>
    );
  }

  if (datosSyncEstado === "synced") return null;

  return (
    <div
      className="trabajador-sync-banner"
      role="status"
      aria-live="polite"
    >
      Actualizando datos…
    </div>
  );
}
