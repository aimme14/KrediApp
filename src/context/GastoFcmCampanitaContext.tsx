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
  href?: string;
};

export type OperativoFcmInput = {
  id: string;
  kind: OperativoFcmKind;
  title: string;
  body: string;
  at: number;
  href?: string;
};

type GastoFcmCampanitaContextValue = {
  unreadCount: number;
  sessionOperativoLines: OperativoFcmSessionItem[];
  /** Sincroniza ítems persistentes desde Firestore (solicitudes, etc.). */
  syncOperativoFromFirestore: (items: OperativoFcmInput[]) => void;
  /** Agrega un aviso efímero recibido por FCM en foreground. */
  addFcmItem: (item: OperativoFcmInput) => void;
  markAllAsRead: () => void;
  dismissItem: (id: string) => void;
  solicitudesPrestamoPendientesCount: number;
  setSolicitudesPrestamoPendientesCount: (count: number) => void;
};

const GastoFcmCampanitaContext =
  createContext<GastoFcmCampanitaContextValue | null>(null);

function isFcmSessionItem(id: string): boolean {
  return id.startsWith("fcm-");
}

export function GastoFcmCampanitaProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionOperativoLines, setSessionOperativoLines] = useState<
    OperativoFcmSessionItem[]
  >([]);
  const [solicitudesPrestamoPendientesCount, setSolicitudesPrestamoPendientesCount] =
    useState(0);
  const readIdsRef = useRef(new Set<string>());
  const dismissedIdsRef = useRef(new Set<string>());

  const unreadCount = useMemo(
    () => sessionOperativoLines.filter((l) => !l.read).length,
    [sessionOperativoLines]
  );

  const syncOperativoFromFirestore = useCallback((items: OperativoFcmInput[]) => {
    setSessionOperativoLines((prev) => {
      const prevRead = new Map(prev.map((l) => [l.id, l.read]));
      const fcmItems = prev.filter((l) => isFcmSessionItem(l.id));
      const firestoreItems = items
        .filter((item) => !dismissedIdsRef.current.has(item.id))
        .map((item) => ({
          ...item,
          read: prevRead.get(item.id) ?? readIdsRef.current.has(item.id),
        }));
      return [...fcmItems, ...firestoreItems].sort(
        (a, b) => (b.at ?? 0) - (a.at ?? 0)
      );
    });
  }, []);

  const addFcmItem = useCallback((item: OperativoFcmInput) => {
    setSessionOperativoLines((prev) => {
      if (prev.some((l) => l.id === item.id)) return prev;
      if (dismissedIdsRef.current.has(item.id)) return prev;
      return [{ ...item, read: false }, ...prev].sort(
        (a, b) => (b.at ?? 0) - (a.at ?? 0)
      );
    });
  }, []);

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
      addFcmItem,
      markAllAsRead,
      dismissItem,
      solicitudesPrestamoPendientesCount,
      setSolicitudesPrestamoPendientesCount,
    }),
    [
      unreadCount,
      sessionOperativoLines,
      syncOperativoFromFirestore,
      addFcmItem,
      markAllAsRead,
      dismissItem,
      solicitudesPrestamoPendientesCount,
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
