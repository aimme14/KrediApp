/**
 * Ledger financiero paralelo (proyección / auditoría).
 *
 * Fuente de verdad operativa: saldos de negocio en Firestore
 * (`cajaRuta`, `cajasEmpleados`, `cajaEmpleado`, `cajaAdmin`, etc.).
 * Este módulo NO decide cobros ni patrimonios; solo registra movimientos
 * cuando `FINANCIAL_LEDGER_ENABLED=1`.
 *
 * Patrón outbox:
 * 1. En la misma transacción de negocio → `enqueueLedgerOutboxInTx`
 * 2. Tras commit → `drainLedgerOutbox` (idempotente por `operationId`)
 * Si el drain falla, el outbox queda `pending` y se puede reintentar.
 */

import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  FINANCIAL_MOVEMENTS_SUBCOLLECTION,
  FINANCIAL_LEDGER_OUTBOX_SUBCOLLECTION,
  WALLET_BALANCES_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

export type WalletType =
  | "empresa_caja"
  | "admin_caja"
  | "ruta_caja"
  | "empleado_caja";

export type LedgerDirection = "debit" | "credit";

export type LedgerMovementSpec = {
  walletType: WalletType;
  walletId: string;
  amount: number;
  balanceAfter?: number;
  direction: LedgerDirection;
  eventType: string;
  scope: "empresa" | "admin" | "ruta" | "empleado";
  createdBy: string;
  relatedEntityType: "gasto" | "prestamo" | "pago";
  relatedEntityId: string;
  metadata?: Record<string, unknown>;
  /** Clave de idempotencia; también id del doc de movimiento y del outbox. */
  operationId: string;
};

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

export function isFinancialLedgerEnabled(): boolean {
  return process.env.FINANCIAL_LEDGER_ENABLED === "1";
}

function walletBalanceDocId(walletType: WalletType, walletId: string): string {
  return `${walletType}:${walletId}`;
}

function empresaRef(db: Firestore, empresaId: string): DocumentReference {
  return db.collection(EMPRESAS_COLLECTION).doc(empresaId);
}

function outboxRef(db: Firestore, empresaId: string, operationId: string) {
  return empresaRef(db, empresaId)
    .collection(FINANCIAL_LEDGER_OUTBOX_SUBCOLLECTION)
    .doc(operationId);
}

function movementRef(db: Firestore, empresaId: string, operationId: string) {
  return empresaRef(db, empresaId)
    .collection(FINANCIAL_MOVEMENTS_SUBCOLLECTION)
    .doc(operationId);
}

function sanitizeSpec(spec: LedgerMovementSpec): LedgerMovementSpec | null {
  const operationId = (spec.operationId ?? "").trim();
  const walletId = (spec.walletId ?? "").trim();
  if (!operationId || !walletId) return null;
  if (!Number.isFinite(spec.amount) || spec.amount <= 0) return null;
  return {
    ...spec,
    operationId,
    walletId,
    amount: toMoney(spec.amount),
    balanceAfter:
      typeof spec.balanceAfter === "number" && Number.isFinite(spec.balanceAfter)
        ? toMoney(spec.balanceAfter)
        : undefined,
  };
}

/**
 * Encola movimientos en el outbox dentro de una tx de negocio.
 * No-op si el ledger está apagado. Devuelve los operationIds encolados.
 */
export function enqueueLedgerOutboxInTx(
  tx: Transaction,
  db: Firestore,
  empresaId: string,
  movements: LedgerMovementSpec[]
): string[] {
  if (!isFinancialLedgerEnabled()) return [];
  if (!empresaId.trim()) return [];

  const enqueued: string[] = [];
  const now = new Date();

  for (const raw of movements) {
    const spec = sanitizeSpec(raw);
    if (!spec) continue;
    tx.set(
      outboxRef(db, empresaId, spec.operationId),
      {
        ...spec,
        empresaId,
        status: "pending",
        enqueuedAt: now,
        attempts: 0,
      },
      { merge: true }
    );
    enqueued.push(spec.operationId);
  }
  return enqueued;
}

/**
 * Compromete un movimiento idempotente (doc id = operationId) y marca outbox committed.
 */
async function commitLedgerSpec(
  db: Firestore,
  empresaId: string,
  spec: LedgerMovementSpec
): Promise<void> {
  const clean = sanitizeSpec(spec);
  if (!clean) return;

  const movRef = movementRef(db, empresaId, clean.operationId);
  const walletRef = empresaRef(db, empresaId)
    .collection(WALLET_BALANCES_SUBCOLLECTION)
    .doc(walletBalanceDocId(clean.walletType, clean.walletId));
  const boxRef = outboxRef(db, empresaId, clean.operationId);
  const now = new Date();

  const batch = db.batch();
  batch.set(
    movRef,
    {
      movementId: clean.operationId,
      operationId: clean.operationId,
      empresaId,
      walletType: clean.walletType,
      walletId: clean.walletId,
      direction: clean.direction,
      amount: clean.amount,
      signedAmount: clean.direction === "debit" ? -clean.amount : clean.amount,
      currency: "COP",
      eventType: clean.eventType,
      scope: clean.scope,
      relatedEntityType: clean.relatedEntityType,
      relatedEntityId: clean.relatedEntityId,
      metadata: clean.metadata ?? {},
      createdBy: clean.createdBy,
      createdAt: FieldValue.serverTimestamp(),
      status: "committed",
    },
    { merge: true }
  );

  if (typeof clean.balanceAfter === "number") {
    batch.set(
      walletRef,
      {
        walletType: clean.walletType,
        walletId: clean.walletId,
        balance: clean.balanceAfter,
        currency: "COP",
        updatedAt: now,
        lastMovementId: clean.operationId,
        lastOperationId: clean.operationId,
      },
      { merge: true }
    );
  }

  batch.set(
    boxRef,
    {
      status: "committed",
      committedAt: now,
    },
    { merge: true }
  );

  await batch.commit();
}

/**
 * Drena outbox pending → financialMovements.
 * Idempotente: reintentar el mismo operationId no duplica movimientos.
 */
export async function drainLedgerOutbox(
  db: Firestore,
  empresaId: string,
  operationIds: string[]
): Promise<{ committed: number; failed: number; skipped: number }> {
  if (!isFinancialLedgerEnabled()) {
    return { committed: 0, failed: 0, skipped: operationIds.length };
  }

  let committed = 0;
  let failed = 0;
  let skipped = 0;

  for (const rawId of operationIds) {
    const operationId = rawId.trim();
    if (!operationId) {
      skipped += 1;
      continue;
    }

    try {
      const snap = await outboxRef(db, empresaId, operationId).get();
      if (!snap.exists) {
        skipped += 1;
        continue;
      }
      const data = snap.data() as Record<string, unknown>;
      if (data.status === "committed") {
        skipped += 1;
        continue;
      }

      const spec: LedgerMovementSpec = {
        walletType: data.walletType as WalletType,
        walletId: String(data.walletId ?? ""),
        amount: Number(data.amount),
        balanceAfter:
          typeof data.balanceAfter === "number" ? data.balanceAfter : undefined,
        direction: data.direction as LedgerDirection,
        eventType: String(data.eventType ?? ""),
        scope: data.scope as LedgerMovementSpec["scope"],
        createdBy: String(data.createdBy ?? ""),
        relatedEntityType:
          data.relatedEntityType as LedgerMovementSpec["relatedEntityType"],
        relatedEntityId: String(data.relatedEntityId ?? ""),
        metadata:
          data.metadata && typeof data.metadata === "object"
            ? (data.metadata as Record<string, unknown>)
            : {},
        operationId,
      };

      await commitLedgerSpec(db, empresaId, spec);
      committed += 1;
    } catch (e) {
      failed += 1;
      console.warn(`[ledger] drain falló operationId=${operationId}`, e);
      try {
        await outboxRef(db, empresaId, operationId).set(
          {
            status: "pending",
            lastError: e instanceof Error ? e.message : String(e),
            lastAttemptAt: new Date(),
            attempts: FieldValue.increment(1),
          },
          { merge: true }
        );
      } catch {
        /* ignore secondary failure */
      }
    }
  }

  return { committed, failed, skipped };
}

/**
 * Marca ledgerStatus en un pago (best-effort, fuera de la tx de negocio).
 */
export async function markPagoLedgerStatus(params: {
  db: Firestore;
  empresaId: string;
  prestamoId: string;
  pagoId: string;
  status: "pending" | "committed" | "skipped";
}): Promise<void> {
  const { db, empresaId, prestamoId, pagoId, status } = params;
  if (!empresaId || !prestamoId || !pagoId) return;
  try {
    await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(PRESTAMOS_SUBCOLLECTION)
      .doc(prestamoId)
      .collection(PAGOS_SUBCOLLECTION)
      .doc(pagoId)
      .set({ ledgerStatus: status, ledgerUpdatedAt: new Date() }, { merge: true });
  } catch (e) {
    console.warn("[ledger] No se pudo marcar ledgerStatus en pago", e);
  }
}

/**
 * Encola + drena un lote. Si el drain falla, el outbox queda pending.
 * Usar cuando no hay transacción de negocio (gastos, etc.).
 */
export async function recordLedgerMovementsReliable(params: {
  db: Firestore;
  empresaId: string;
  movements: LedgerMovementSpec[];
}): Promise<{ committed: number; failed: number }> {
  const { db, empresaId, movements } = params;
  if (!isFinancialLedgerEnabled()) return { committed: 0, failed: 0 };

  const ids: string[] = [];
  for (const raw of movements) {
    const spec = sanitizeSpec(raw);
    if (!spec) continue;
    await outboxRef(db, empresaId, spec.operationId).set(
      {
        ...spec,
        empresaId,
        status: "pending",
        enqueuedAt: new Date(),
        attempts: 0,
      },
      { merge: true }
    );
    ids.push(spec.operationId);
  }

  const result = await drainLedgerOutbox(db, empresaId, ids);
  return { committed: result.committed, failed: result.failed };
}

/** Registra un débito (API legacy). Idempotente por operationId. */
export async function recordDebitMovement(
  params: RecordDebitMovementParams
): Promise<void> {
  await recordMovement({ ...params, direction: "debit" });
}

/** Registra un crédito (API legacy). Idempotente por operationId. */
export async function recordCreditMovement(
  params: RecordDebitMovementParams
): Promise<void> {
  await recordMovement({ ...params, direction: "credit" });
}

async function recordMovement(
  params: RecordDebitMovementParams & { direction: LedgerDirection }
): Promise<void> {
  if (!isFinancialLedgerEnabled()) return;

  const spec = sanitizeSpec({
    walletType: params.walletType,
    walletId: params.walletId,
    amount: params.amount,
    balanceAfter: params.balanceAfter,
    direction: params.direction,
    eventType: params.eventType,
    scope: params.scope,
    createdBy: params.createdBy,
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    metadata: params.metadata,
    operationId: params.operationId,
  });
  if (!spec) return;

  const result = await recordLedgerMovementsReliable({
    db: params.db,
    empresaId: params.empresaId,
    movements: [spec],
  });
  if (result.failed > 0) {
    throw new Error(`LEDGER_DRAIN_FAILED:${spec.operationId}`);
  }
}

/**
 * Construye los 2 créditos (capital + interés) de un cobro, con balanceAfter
 * solo en el último movimiento de la wallet (saldo final correcto).
 */
export function buildPagoLedgerCredits(params: {
  acreditaCajaRuta: boolean;
  rutaId: string | null;
  empleadoId: string | null;
  pagoId: string;
  cuotaCapital: number;
  cuotaGanancia: number;
  walletBalanceAfter?: number;
  createdBy: string;
  prestamoId: string;
  metodoPago: string;
}): LedgerMovementSpec[] {
  const walletType: WalletType = params.acreditaCajaRuta
    ? "ruta_caja"
    : "empleado_caja";
  const walletId = params.acreditaCajaRuta
    ? (params.rutaId ?? "").trim()
    : (params.empleadoId ?? "").trim();
  if (!walletId) return [];

  const scope = params.acreditaCajaRuta ? "ruta" : "empleado";
  const meta = {
    prestamoId: params.prestamoId,
    rutaId: params.rutaId,
    metodoPago: params.metodoPago,
  };
  const specs: LedgerMovementSpec[] = [];

  if (params.cuotaCapital > 0) {
    specs.push({
      direction: "credit",
      walletType,
      walletId,
      amount: params.cuotaCapital,
      eventType: params.acreditaCajaRuta
        ? "pago_prestamo_admin"
        : "pago_prestamo_capital",
      scope,
      createdBy: params.createdBy,
      relatedEntityType: "pago",
      relatedEntityId: params.pagoId,
      metadata: meta,
      operationId: `pago_capital:${params.pagoId}`,
    });
  }
  if (params.cuotaGanancia > 0) {
    specs.push({
      direction: "credit",
      walletType,
      walletId,
      amount: params.cuotaGanancia,
      balanceAfter: params.walletBalanceAfter,
      eventType: params.acreditaCajaRuta
        ? "pago_prestamo_admin"
        : "pago_prestamo_interes",
      scope,
      createdBy: params.createdBy,
      relatedEntityType: "pago",
      relatedEntityId: params.pagoId,
      metadata: meta,
      operationId: `pago_interes:${params.pagoId}`,
    });
  } else if (
    params.cuotaCapital > 0 &&
    typeof params.walletBalanceAfter === "number"
  ) {
    // Solo capital: el balanceAfter va en el único movimiento.
    specs[0] = { ...specs[0], balanceAfter: params.walletBalanceAfter };
  }

  return specs;
}

/**
 * Débitos de anulación (espejo del cobro), balanceAfter en el último de la wallet.
 */
export function buildAnulacionLedgerDebits(params: {
  acreditaCajaRuta: boolean;
  rutaId: string | null;
  empleadoId: string | null;
  pagoId: string;
  cuotaCapital: number;
  cuotaGanancia: number;
  walletBalanceAfter?: number | null;
  createdBy: string;
  prestamoId: string;
  modo: string;
}): LedgerMovementSpec[] {
  const walletType: WalletType = params.acreditaCajaRuta
    ? "ruta_caja"
    : "empleado_caja";
  const walletId = params.acreditaCajaRuta
    ? (params.rutaId ?? "").trim()
    : (params.empleadoId ?? "").trim();
  if (!walletId) return [];

  const scope = params.acreditaCajaRuta ? "ruta" : "empleado";
  const meta = {
    prestamoId: params.prestamoId,
    rutaId: params.rutaId,
    modo: params.modo,
  };
  const specs: LedgerMovementSpec[] = [];

  if (params.cuotaCapital > 0) {
    specs.push({
      direction: "debit",
      walletType,
      walletId,
      amount: params.cuotaCapital,
      eventType: "anulacion_pago_capital",
      scope,
      createdBy: params.createdBy,
      relatedEntityType: "pago",
      relatedEntityId: params.pagoId,
      metadata: meta,
      operationId: `anulacion_capital:${params.pagoId}`,
    });
  }
  if (params.cuotaGanancia > 0) {
    specs.push({
      direction: "debit",
      walletType,
      walletId,
      amount: params.cuotaGanancia,
      balanceAfter:
        typeof params.walletBalanceAfter === "number"
          ? params.walletBalanceAfter
          : undefined,
      eventType: "anulacion_pago_ganancia",
      scope,
      createdBy: params.createdBy,
      relatedEntityType: "pago",
      relatedEntityId: params.pagoId,
      metadata: meta,
      operationId: `anulacion_ganancia:${params.pagoId}`,
    });
  } else if (
    params.cuotaCapital > 0 &&
    typeof params.walletBalanceAfter === "number"
  ) {
    specs[0] = { ...specs[0], balanceAfter: params.walletBalanceAfter };
  }

  return specs;
}
