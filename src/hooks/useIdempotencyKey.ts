"use client";

import { useCallback, useRef } from "react";

export type IdempotencyKeyHandle = {
  /** Clave del intento en curso para esa firma de operación. */
  obtener: (firma: string) => string;
  /** Llamar solo cuando el servidor confirmó: libera la clave. */
  confirmar: () => void;
};

/**
 * Clave de idempotencia por intento, para operaciones de dinero.
 *
 * Si la respuesta del servidor se pierde (red caída tras el commit), el usuario
 * ve un error y suele reintentar. Reutilizar la misma clave permite al servidor
 * reconocer el reintento y devolver el resultado original en vez de volver a
 * mover dinero.
 *
 * La firma identifica la operación (monto, destino…): si cambia, se emite una
 * clave nueva, porque ya no es el mismo intento sino una operación distinta que
 * sí debe ejecutarse.
 */
export function useIdempotencyKey(): IdempotencyKeyHandle {
  const intento = useRef<{ firma: string; key: string } | null>(null);

  const obtener = useCallback((firma: string) => {
    if (intento.current?.firma === firma) return intento.current.key;
    const key = crypto.randomUUID();
    intento.current = { firma, key };
    return key;
  }, []);

  const confirmar = useCallback(() => {
    intento.current = null;
  }, []);

  return { obtener, confirmar };
}
