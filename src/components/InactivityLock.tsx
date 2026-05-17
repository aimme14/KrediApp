"use client";

import React from "react";

/** La sesión permanece abierta; sin bloqueo por inactividad. */
export default function InactivityLock({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
