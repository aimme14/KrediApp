"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/** Gastos operativos vs registros de cuota por trabajador */
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
  /** Sincroniza la campanita desde Firestore (onSnapshot). */
  syncOperativoFromFirestore: (
    items: Array<{
      id: string;
      kind: OperativoFcmKind;
      title: string;
      body: string;
      at: number;
    }>
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
  const readIdsRef = useRef(new Set<string>());
  const dismissedIdsRef = useRef(new Set<string>());

  const unreadCount = useMemo(
    () => sessionOperativoLines.filter((l) => !l.read).length,
    [sessionOperativoLines]
  );

  const syncOperativoFromFirestore = useCallback(
    (
      items: Array<{
        id: string;
        kind: OperativoFcmKind;
        title: string;
        body: string;
        at: number;
      }>
    ) => {
      setSessionOperativoLines((prev) => {
        const prevRead = new Map(prev.map((l) => [l.id, l.read]));
        return items
          .filter((item) => !dismissedIdsRef.current.has(item.id))
          .map((item) => ({
            ...item,
            read:
              prevRead.get(item.id) ??
              readIdsRef.current.has(item.id),
          }));
      });
    },
    []
  );

  const markAllAsRead = useCallback(() => {
    setSessionOperativoLines((prev) => {
      for (const l of prev) readIdsRef.current.add(l.id);
      return prev.map((l) => ({ ...l, read: true }));
    });
  }, []);

  const dismissItem = useCallback((id: string) => {
    dismissedIdsRef.current.add(id);
    setSessionOperativoLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      sessionOperativoLines,
      syncOperativoFromFirestore,
      markAllAsRead,
      dismissItem,
    }),
    [
      unreadCount,
      sessionOperativoLines,
      syncOperativoFromFirestore,
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
