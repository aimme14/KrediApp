/**
 * Idempotencia de operaciones financieras.
 *
 * Un doc por clave en empresas/{id}/financialOperations/{key} actúa como lock:
 * quien logra crearlo ejecuta la operación, el resto recibe el resultado
 * cacheado o un 409 mientras la primera termina.
 *
 * El lock se toma dentro de una transacción para que dos requests simultáneos
 * no puedan reclamarlo a la vez.
 */

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  FINANCIAL_OPERATIONS_SUBCOLLECTION,
} from "@/lib/empresas-db";

type StoredResult = {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
};

export type IdempotencyReplay =
  | { replay: false }
  | { replay: true; status: number; payload: Record<string, unknown> };

/** Resultado de un handler idempotente, antes de convertirse en respuesta HTTP. */
export type IdempotentOutcome = {
  status: number;
  payload: Record<string, unknown>;
};

/**
 * Un lock `processing` más viejo que esto se considera huérfano (el proceso que
 * lo tomó murió) y puede reclamarse. Sin esto, un crash dejaba la clave
 * bloqueada en 409 para siempre.
 */
export const PROCESSING_TTL_MS = 90_000;

function cleanKey(value: string | undefined | null): string {
  return (value ?? "").trim();
}

function operationRef(db: Firestore, empresaId: string, key: string) {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(FINANCIAL_OPERATIONS_SUBCOLLECTION)
    .doc(key);
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  const v = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return 0;
}

/**
 * Reclama el lock de la clave. Devuelve `replay: false` si esta llamada debe
 * ejecutar la operación.
 */
export async function startIdempotentOperation(params: {
  db: Firestore;
  empresaId: string;
  key?: string | null;
  endpoint: string;
  uid: string;
  nowMs?: number;
}): Promise<IdempotencyReplay> {
  const key = cleanKey(params.key);
  if (!key) return { replay: false };

  const ref = operationRef(params.db, params.empresaId, key);
  const nowMs = params.nowMs ?? Date.now();

  return params.db.runTransaction<IdempotencyReplay>(async (tx) => {
    const snap = await tx.get(ref);

    const claim = (attempts: number) => {
      tx.set(
        ref,
        {
          key,
          endpoint: params.endpoint,
          uid: params.uid,
          status: "processing",
          createdAt: new Date(nowMs),
          attempts,
          // Restos de un intento anterior que no debe replayarse.
          ok: FieldValue.delete(),
          httpStatus: FieldValue.delete(),
          response: FieldValue.delete(),
          finishedAt: FieldValue.delete(),
        },
        { merge: true }
      );
    };

    if (!snap.exists) {
      claim(1);
      return { replay: false };
    }

    const data = snap.data() as Record<string, unknown>;

    // Solo los éxitos son terminales: un fallo debe poder reintentarse con la
    // misma clave una vez corregida la causa (p. ej. tras fondear la caja).
    if (
      data.status === "done" &&
      data.ok === true &&
      typeof data.httpStatus === "number"
    ) {
      return {
        replay: true,
        status: data.httpStatus,
        payload: (data.response as Record<string, unknown>) ?? { ok: true },
      };
    }

    const attempts = typeof data.attempts === "number" ? data.attempts : 0;
    const lockVencido = nowMs - toMillis(data.createdAt) > PROCESSING_TTL_MS;

    if (data.status !== "processing" || lockVencido) {
      claim(attempts + 1);
      return { replay: false };
    }

    return {
      replay: true,
      status: 409,
      payload: { error: "Operación en proceso. Reintenta en unos segundos." },
    };
  });
}

/**
 * Cierra la operación. Los éxitos quedan cacheados; los fallos liberan la
 * clave para permitir un reintento legítimo.
 */
export async function finishIdempotentOperation(params: {
  db: Firestore;
  empresaId: string;
  key?: string | null;
  result: StoredResult;
}): Promise<void> {
  const key = cleanKey(params.key);
  if (!key) return;
  const ref = operationRef(params.db, params.empresaId, key);

  if (!params.result.ok) {
    await releaseIdempotentOperation({
      db: params.db,
      empresaId: params.empresaId,
      key,
    });
    return;
  }

  await ref.set(
    {
      status: "done",
      httpStatus: params.result.status,
      response: params.result.payload,
      ok: true,
      finishedAt: new Date(),
    },
    { merge: true }
  );
}

/** Libera la clave sin cachear resultado (fallo de negocio o excepción). */
export async function releaseIdempotentOperation(params: {
  db: Firestore;
  empresaId: string;
  key?: string | null;
}): Promise<void> {
  const key = cleanKey(params.key);
  if (!key) return;
  try {
    await operationRef(params.db, params.empresaId, key).delete();
  } catch (e) {
    // Si no se puede borrar, el TTL de `processing` lo recupera igualmente.
    console.warn("[idempotencia] No se pudo liberar la clave", key, e);
  }
}

/**
 * Ejecuta `handler` bajo el lock de idempotencia, garantizando que la clave se
 * libere aunque el handler lance una excepción no controlada.
 */
export async function runIdempotent(params: {
  db: Firestore;
  empresaId: string;
  key?: string | null;
  endpoint: string;
  uid: string;
  handler: () => Promise<IdempotentOutcome>;
}): Promise<IdempotentOutcome> {
  const { db, empresaId, key, endpoint, uid, handler } = params;

  const idem = await startIdempotentOperation({
    db,
    empresaId,
    key,
    endpoint,
    uid,
  });
  if (idem.replay) {
    return { status: idem.status, payload: idem.payload };
  }

  let outcome: IdempotentOutcome;
  try {
    outcome = await handler();
  } catch (e) {
    await releaseIdempotentOperation({ db, empresaId, key });
    throw e;
  }

  await finishIdempotentOperation({
    db,
    empresaId,
    key,
    result: {
      ok: outcome.status < 400,
      status: outcome.status,
      payload: outcome.payload,
    },
  });

  return outcome;
}
