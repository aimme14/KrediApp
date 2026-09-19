"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  collectionGroup,
  onSnapshot,
  query,
  where,
  Timestamp,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  fechaDiaColombiaHoy,
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";
import { TIPO_PAGO_PASA_MAS_TARDE } from "@/lib/pasa-mas-tarde-constants";

export type MarcadoresPagosDiaHoy = {
  noPagosHoy: { prestamoId: string }[];
  pasaMasTardeHoy: { prestamoId: string }[];
};

const EMPTY_MARCADORES: MarcadoresPagosDiaHoy = {
  noPagosHoy: [],
  pasaMasTardeHoy: [],
};

function prestamoIdFromDoc(
  data: Record<string, unknown>,
  docRefParent: { parent: { parent: { id: string } | null } | null }
): string {
  if (typeof data.prestamoId === "string" && data.prestamoId.trim()) {
    return data.prestamoId.trim();
  }
  return docRefParent.parent?.parent?.id ?? "";
}

export type MarcadoresPagosDiaScope =
  | { kind: "admin"; adminUid: string }
  /** Cobros/marcadores de toda la ruta (incluye los que registró el admin). */
  | { kind: "empleado_ruta"; rutaId: string };

type HookState = {
  marcadores: MarcadoresPagosDiaHoy;
  loading: boolean;
  error: string | null;
};

type HookAction =
  | { type: "reset_idle" }
  | { type: "subscribe_start" }
  | { type: "success"; marcadores: MarcadoresPagosDiaHoy }
  | { type: "error"; message: string };

function hookReducer(state: HookState, action: HookAction): HookState {
  switch (action.type) {
    case "reset_idle":
      return { marcadores: EMPTY_MARCADORES, loading: false, error: null };
    case "subscribe_start":
      return { ...state, loading: true, error: null };
    case "success":
      return { marcadores: action.marcadores, loading: false, error: null };
    case "error":
      return { ...state, loading: false, error: action.message };
    default:
      return state;
  }
}

/**
 * Escucha pagos del día (collectionGroup) para no_pago y pasa_mas_tarde.
 * Admin: filtra por `adminId`. Trabajador: por `rutaId` de su ruta.
 */
export function useMarcadoresPagosDiaHoy(
  enabled: boolean,
  empresaId: string | undefined,
  scope: MarcadoresPagosDiaScope | undefined
) {
  const fechaDia = fechaDiaColombiaHoy();
  const [state, dispatch] = useReducer(hookReducer, {
    marcadores: EMPTY_MARCADORES,
    loading: true,
    error: null,
  });
  const loadedQueryKeyRef = useRef("");

  const scopeKind = scope?.kind;
  const scopeFilterValue =
    scope?.kind === "admin"
      ? scope.adminUid.trim()
      : scope?.kind === "empleado_ruta"
        ? scope.rutaId.trim()
        : "";

  const queryScope = useMemo(() => {
    if (scopeKind === "admin" && scopeFilterValue) {
      return { field: "adminId" as const, uid: scopeFilterValue };
    }
    if (scopeKind === "empleado_ruta" && scopeFilterValue) {
      return { field: "rutaId" as const, uid: scopeFilterValue };
    }
    return null;
  }, [scopeKind, scopeFilterValue]);

  useEffect(() => {
    if (!enabled || !db || !empresaId?.trim() || !queryScope) {
      dispatch({ type: "reset_idle" });
      loadedQueryKeyRef.current = "";
      return;
    }

    const start = inicioDiaColombiaUtc(fechaDia);
    const end = finDiaColombiaUtc(fechaDia);
    if (!start || !end) {
      dispatch({ type: "error", message: "Fecha inválida" });
      return;
    }

    const queryKey = `${empresaId.trim()}|${queryScope.field}|${queryScope.uid}|${fechaDia}`;
    if (loadedQueryKeyRef.current !== queryKey) {
      dispatch({ type: "subscribe_start" });
    }

    let cancelled = false;

    const q = query(
      collectionGroup(db, "pagos"),
      where("empresaId", "==", empresaId.trim()),
      where(queryScope.field, "==", queryScope.uid),
      where("fecha", ">=", Timestamp.fromDate(start)),
      where("fecha", "<=", Timestamp.fromDate(end))
    );

    const applySnapshot = (snap: QuerySnapshot<DocumentData>) => {
      if (cancelled) return;
      const noPagos: { prestamoId: string }[] = [];
      const pasaMasTarde: { prestamoId: string }[] = [];
      for (const doc of snap.docs) {
        const d = doc.data() as Record<string, unknown>;
        if (d.estado === "anulado") continue;
        const prestamoId = prestamoIdFromDoc(d, doc.ref);
        if (!prestamoId) continue;
        if (d.tipo === "no_pago") {
          noPagos.push({ prestamoId });
        } else if (d.tipo === TIPO_PAGO_PASA_MAS_TARDE) {
          pasaMasTarde.push({ prestamoId });
        }
      }
      loadedQueryKeyRef.current = queryKey;
      dispatch({
        type: "success",
        marcadores: { noPagosHoy: noPagos, pasaMasTardeHoy: pasaMasTarde },
      });
    };

    const unsub = onSnapshot(
      q,
      (snap) => {
        queueMicrotask(() => applySnapshot(snap));
      },
      (err) => {
        if (cancelled) return;
        console.warn("[useMarcadoresPagosDiaHoy]", err);
        queueMicrotask(() => {
          if (cancelled) return;
          dispatch({
            type: "error",
            message: err.message || "Error al cargar marcadores del día",
          });
        });
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, empresaId, queryScope, fechaDia]);

  return useMemo(
    () => ({
      marcadores: state.marcadores,
      loading: state.loading,
      error: state.error,
      fechaDia,
    }),
    [state.marcadores, state.loading, state.error, fechaDia]
  );
}
