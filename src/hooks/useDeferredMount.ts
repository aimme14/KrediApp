"use client";

import { useEffect, useState } from "react";

/** Retrasa trabajo no crítico hasta después del primer paint (reduce parse/ejecución en layout). */
export function useDeferredMount(delayMs = 0): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: Math.max(500, delayMs + 200) });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }

    const t = window.setTimeout(run, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [delayMs]);

  return ready;
}
