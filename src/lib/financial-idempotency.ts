import type { Firestore } from "firebase-admin/firestore";
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

export async function startIdempotentOperation(params: {
  db: Firestore;
  empresaId: string;
  key?: string | null;
  endpoint: string;
  uid: string;
}): Promise<IdempotencyReplay> {
  const key = cleanKey(params.key);
  if (!key) return { replay: false };

  const ref = operationRef(params.db, params.empresaId, key);
  try {
    await ref.create({
      key,
      endpoint: params.endpoint,
      uid: params.uid,
      status: "processing",
      createdAt: new Date(),
    });
    return { replay: false };
  } catch {}

  const snap = await ref.get();
  if (!snap.exists) return { replay: false };
  const data = snap.data() as Record<string, unknown>;
  if (data.status === "done" && typeof data.httpStatus === "number") {
    return {
      replay: true,
      status: data.httpStatus,
      payload: (data.response as Record<string, unknown>) ?? { ok: true },
    };
  }
  return {
    replay: true,
    status: 409,
    payload: { error: "Operación en proceso. Reintenta en unos segundos." },
  };
}

export async function finishIdempotentOperation(params: {
  db: Firestore;
  empresaId: string;
  key?: string | null;
  result: StoredResult;
}): Promise<void> {
  const key = cleanKey(params.key);
  if (!key) return;
  const ref = operationRef(params.db, params.empresaId, key);
  await ref.set(
    {
      status: "done",
      httpStatus: params.result.status,
      response: params.result.payload,
      ok: params.result.ok,
      finishedAt: new Date(),
    },
    { merge: true }
  );
}

