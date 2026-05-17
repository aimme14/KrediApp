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
  id: string;
  kind: OperativoFcmKind;
  title: string;
  body: string;
  at: number;
  read: boolean;
};

type GastoFcmCampanitaContextValue = {
  unreadCount: number;
  sessionOperativoLines: OperativoFcmSessionItem[];
  bumpOperativoFromFcm: (
    kind: OperativoFcmKind,
    title: string,
    body: string
  ) => void;
  markAllAsRead: () => void;
  dismissItem: (id: string) => void;
};

const GastoFcmCampanitaContext =
  createContext<GastoFcmCampanitaContextValue | null>(null);

export function GastoFcmCampanitaProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionOperativoLines, setSessionOperativoLines] = useState<
    OperativoFcmSessionItem[]
  >([]);

  const unreadCount = useMemo(
    () => sessionOperativoLines.filter((l) => !l.read).length,
    [sessionOperativoLines]
  );

  const bumpOperativoFromFcm = useCallback(
    (kind: OperativoFcmKind, title: string, body: string) => {
      setSessionOperativoLines((prev) =>
        [
          {
            id: crypto.randomUUID(),
            kind,
            title,
            body,
            at: Date.now(),
            read: false,
          },
          ...prev,
        ].slice(0, 16)
      );
    },
    []
  );

  const markAllAsRead = useCallback(() => {
    setSessionOperativoLines((prev) => prev.map((l) => ({ ...l, read: true })));
  }, []);

  const dismissItem = useCallback((id: string) => {
    setSessionOperativoLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      sessionOperativoLines,
      bumpOperativoFromFcm,
      markAllAsRead,
      dismissItem,
    }),
    [
      unreadCount,
      sessionOperativoLines,
      bumpOperativoFromFcm,
      markAllAsRead,
      dismissItem,
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
