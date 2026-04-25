import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  FINANCIAL_MOVEMENTS_SUBCOLLECTION,
  WALLET_BALANCES_SUBCOLLECTION,
} from "@/lib/empresas-db";

export type WalletType =
  | "empresa_caja"
  | "admin_caja"
  | "ruta_caja"
  | "empleado_caja";

type RecordDebitMovementParams = {
  db: Firestore;
  empresaId: string;
  walletType: WalletType;
  walletId: string;
  amount: number;
  balanceAfter?: number;
  eventType: string;
  scope: "empresa" | "admin" | "ruta" | "empleado";
  createdBy: string;
  relatedEntityType: "gasto" | "prestamo" | "pago";
  relatedEntityId: string;
  metadata?: Record<string, unknown>;
  operationId: string;
};

function toMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function isLedgerEnabled(): boolean {
  return process.env.FINANCIAL_LEDGER_ENABLED === "1";
}

function walletBalanceDocId(walletType: WalletType, walletId: string): string {
  return `${walletType}:${walletId}`;
}

/**
 * Registra un movimiento de débito y actualiza el saldo proyectado de la wallet.
 * Es "best-effort": el caller decide si errores deben impactar negocio.
 */
export async function recordDebitMovement(params: RecordDebitMovementParams): Promise<void> {
  await recordMovement({
    ...params,
    direction: "debit",
  });
}

export async function recordCreditMovement(params: RecordDebitMovementParams): Promise<void> {
  await recordMovement({
    ...params,
    direction: "credit",
  });
}

async function recordMovement(
  params: RecordDebitMovementParams & { direction: "debit" | "credit" }
): Promise<void> {
  if (!isLedgerEnabled()) return;

  const {
    db,
    empresaId,
    walletType,
    walletId,
    amount,
    balanceAfter,
    eventType,
    scope,
    createdBy,
    relatedEntityType,
    relatedEntityId,
    metadata,
    operationId,
    direction,
  } = params;

  if (!empresaId || !walletId) return;
  if (!Number.isFinite(amount) || amount <= 0) return;

  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const movementRef = empresaRef.collection(FINANCIAL_MOVEMENTS_SUBCOLLECTION).doc();
  const walletRef = empresaRef
    .collection(WALLET_BALANCES_SUBCOLLECTION)
    .doc(walletBalanceDocId(walletType, walletId));

  const now = new Date();
  const cleanAmount = toMoney(amount);
  const hasBalanceAfter = typeof balanceAfter === "number" && Number.isFinite(balanceAfter);
  const cleanBalanceAfter = hasBalanceAfter ? toMoney(balanceAfter as number) : null;

  const batch = db.batch();
  batch.set(movementRef, {
    movementId: movementRef.id,
    operationId,
    empresaId,
    walletType,
    walletId,
    direction,
    amount: cleanAmount,
    signedAmount: direction === "debit" ? -cleanAmount : cleanAmount,
    currency: "COP",
    eventType,
    scope,
    relatedEntityType,
    relatedEntityId,
    metadata: metadata ?? {},
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    status: "committed",
  });

  if (hasBalanceAfter) {
    batch.set(
      walletRef,
      {
        walletType,
        walletId,
        balance: cleanBalanceAfter,
        currency: "COP",
        updatedAt: now,
        lastMovementId: movementRef.id,
        lastOperationId: operationId,
      },
      { merge: true }
    );
  }
  await batch.commit();
}

