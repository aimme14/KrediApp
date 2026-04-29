"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/** Gastos operativos FCM vs registros de cuota por trabajador */
export type OperativoFcmKind = "gasto" | "cuota";

export type OperativoFcmSessionItem = {
  kind: OperativoFcmKind;
  title: string;
  body: string;
  at: number;
};

type GastoFcmCampanitaContextValue = {
  /** Badge: gastos + cuotas en primer plano (sin Firestore). */
  foregroundOperativoBadge: number;
  sessionOperativoLines: OperativoFcmSessionItem[];
  bumpOperativoFromFcm: (
    kind: OperativoFcmKind,
    title: string,
    body: string
  ) => void;
  clearBadgeOnly: () => void;
};

const GastoFcmCampanitaContext =
  createContext<GastoFcmCampanitaContextValue | null>(null);

export function GastoFcmCampanitaProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [foregroundOperativoBadge, setForegroundOperativoBadge] = useState(0);
  const [sessionOperativoLines, setSessionOperativoLines] = useState<
    OperativoFcmSessionItem[]
  >([]);

  const bumpOperativoFromFcm = useCallback(
    (kind: OperativoFcmKind, title: string, body: string) => {
      setForegroundOperativoBadge((n) => n + 1);
      setSessionOperativoLines((prev) =>
        [{ kind, title, body, at: Date.now() }, ...prev].slice(0, 16)
      );
    },
    []
  );

  const clearBadgeOnly = useCallback(() => {
    setForegroundOperativoBadge(0);
  }, []);

  const value = useMemo(
    () => ({
      foregroundOperativoBadge,
      sessionOperativoLines,
      bumpOperativoFromFcm,
      clearBadgeOnly,
    }),
    [
      foregroundOperativoBadge,
      sessionOperativoLines,
      bumpOperativoFromFcm,
      clearBadgeOnly,
    ]
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
