"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type GastoFcmSessionItem = {
  title: string;
  body: string;
  at: number;
};

type GastoFcmCampanitaContextValue = {
  /** Contador para el badge (solo mensajes FCM en primer plano). Sin Firestore. */
  foregroundGastoBadge: number;
  /** Textos recibidos en esta sesión para mostrar en el panel */
  sessionGastoLines: GastoFcmSessionItem[];
  bumpFromFcm: (title: string, body: string) => void;
  /** Solo pone el badge en 0 al abrir la campanita; las líneas siguen visibles en el panel */
  clearBadgeOnly: () => void;
};

const GastoFcmCampanitaContext =
  createContext<GastoFcmCampanitaContextValue | null>(null);

export function GastoFcmCampanitaProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [foregroundGastoBadge, setForegroundGastoBadge] = useState(0);
  const [sessionGastoLines, setSessionGastoLines] = useState<
    GastoFcmSessionItem[]
  >([]);

  const bumpFromFcm = useCallback((title: string, body: string) => {
    setForegroundGastoBadge((n) => n + 1);
    setSessionGastoLines((prev) =>
      [{ title, body, at: Date.now() }, ...prev].slice(0, 12)
    );
  }, []);

  const clearBadgeOnly = useCallback(() => {
    setForegroundGastoBadge(0);
  }, []);

  const value = useMemo(
    () => ({
      foregroundGastoBadge,
      sessionGastoLines,
      bumpFromFcm,
      clearBadgeOnly,
    }),
    [foregroundGastoBadge, sessionGastoLines, bumpFromFcm, clearBadgeOnly]
  );

  return (
    <GastoFcmCampanitaContext.Provider value={value}>
      {children}
    </GastoFcmCampanitaContext.Provider>
  );
}

export function useGastoFcmCampanita(): GastoFcmCampanitaContextValue {
  const ctx = useContext(GastoFcmCampanitaContext);
  if (!ctx) {
    throw new Error(
      "useGastoFcmCampanita debe usarse dentro de GastoFcmCampanitaProvider"
    );
  }
  return ctx;
}
