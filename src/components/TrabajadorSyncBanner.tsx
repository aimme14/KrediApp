"use client";

import { useTrabajadorLista } from "@/context/TrabajadorListaContext";

export function TrabajadorSyncBanner() {
  const { datosSyncEstado } = useTrabajadorLista();
  if (datosSyncEstado === "synced") return null;
  const msg =
    datosSyncEstado === "offline"
      ? "Sin conexión — mostrando datos guardados"
      : "Actualizando datos…";
  return (
    <div className="trabajador-sync-banner" role="status" aria-live="polite">
      {msg}
    </div>
  );
}
