"use client";

import { createContext, useContext, type ReactNode } from "react";

type SetHeaderLeftSlot = (node: ReactNode) => void;

const DashboardHeaderContext = createContext<SetHeaderLeftSlot | null>(null);

export function useDashboardHeaderSlot(): SetHeaderLeftSlot | null {
  return useContext(DashboardHeaderContext);
}

export function DashboardHeaderProvider({
  value,
  children,
}: {
  value: SetHeaderLeftSlot;
  children: ReactNode;
}) {
  return (
    <DashboardHeaderContext.Provider value={value}>
      {children}
    </DashboardHeaderContext.Provider>
  );
}
