"use client";

import { useEffect, useState } from "react";

/** Viewport estrecho tipo teléfono (tablets ≥641px quedan fuera). */
const PHONE_MQ = "(max-width: 640px)";

export function useIsPhoneViewport(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isPhone;
}
