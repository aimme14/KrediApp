"use client";

import { useEffect } from "react";
import { useOnline } from "@/hooks/useOnline";

/** Marca `<html data-offline>` para estilos globales que bloquean submits accidentales. */
export function OfflineRootEffect() {
  const online = useOnline();

  useEffect(() => {
    if (online) {
      document.documentElement.removeAttribute("data-offline");
    } else {
      document.documentElement.setAttribute("data-offline", "true");
    }
    return () => {
      document.documentElement.removeAttribute("data-offline");
    };
  }, [online]);

  return null;
}
