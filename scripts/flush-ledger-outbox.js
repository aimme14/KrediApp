/**
 * Drena outbox pendiente del ledger (`financialLedgerOutbox` status=pending).
 *
 * Uso:
 *   node scripts/flush-ledger-outbox.js --dry-run
 *   node scripts/flush-ledger-outbox.js
 *   node scripts/flush-ledger-outbox.js --empresa=<empresaId>
 *
 * Requiere FINANCIAL_LEDGER_ENABLED=1 y serviceAccountKey.json en la raíz.
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const EMPRESAS_COLLECTION = "empresas";
const OUTBOX = "financialLedgerOutbox";
const MOVEMENTS = "financialMovements";
const WALLETS = "walletBalances";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const empresaArg = args.find((a) => a.startsWith("--empresa="));
const empresaFilter = empresaArg ? empresaArg.slice("--empresa=".length).trim() : "";

if (process.env.FINANCIAL_LEDGER_ENABLED !== "1") {
  console.error("FINANCIAL_LEDGER_ENABLED debe ser '1' para drenar el outbox.");
  process.exit(1);
}

function toMoney(n) {
  return Math.round(n * 100) / 100;
}

async function commitOne(empresaId, operationId, data) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const amount = toMoney(Number(data.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount inválido");
  }
  const walletId = String(data.walletId || "").trim();
  const walletType = data.walletType;
  if (!walletId || !walletType) throw new Error("wallet incompleta");

  const direction = data.direction === "debit" ? "debit" : "credit";
  const movRef = empresaRef.collection(MOVEMENTS).doc(operationId);
  const walletRef = empresaRef.collection(WALLETS).doc(`${walletType}:${walletId}`);
  const boxRef = empresaRef.collection(OUTBOX).doc(operationId);
  const now = new Date();

  const batch = db.batch();
  batch.set(
    movRef,
    {
      movementId: operationId,
      operationId,
      empresaId,
      walletType,
      walletId,
      direction,
      amount,
      signedAmount: direction === "debit" ? -amount : amount,
      currency: "COP",
      eventType: data.eventType || "",
      scope: data.scope || "",
      relatedEntityType: data.relatedEntityType || "",
      relatedEntityId: data.relatedEntityId || "",
      metadata: data.metadata || {},
      createdBy: data.createdBy || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "committed",
    },
    { merge: true }
  );

  if (typeof data.balanceAfter === "number" && Number.isFinite(data.balanceAfter)) {
    batch.set(
      walletRef,
      {
        walletType,
        walletId,
        balance: toMoney(data.balanceAfter),
        currency: "COP",
        updatedAt: now,
        lastMovementId: operationId,
        lastOperationId: operationId,
      },
      { merge: true }
    );
  }

  batch.set(boxRef, { status: "committed", committedAt: now }, { merge: true });
  await batch.commit();
}

async function flushEmpresa(empresaId) {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(OUTBOX)
    .where("status", "==", "pending")
    .limit(200)
    .get();

  if (snap.empty) {
    console.log(`[${empresaId}] sin pending`);
    return { committed: 0, failed: 0 };
  }

  let committed = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (dryRun) {
      console.log(`  [dry-run] ${doc.id} ${data.eventType} ${data.amount}`);
      committed += 1;
      continue;
    }
    try {
      await commitOne(empresaId, doc.id, data);
      committed += 1;
      console.log(`  OK ${doc.id}`);
    } catch (e) {
      failed += 1;
      console.warn(`  FAIL ${doc.id}:`, e.message || e);
    }
  }
  return { committed, failed };
}

async function main() {
  console.log(dryRun ? "Flush ledger outbox (DRY-RUN)" : "Flush ledger outbox");

  let empresas;
  if (empresaFilter) {
    empresas = [{ id: empresaFilter }];
  } else {
    const snap = await db.collection(EMPRESAS_COLLECTION).get();
    empresas = snap.docs.map((d) => ({ id: d.id }));
  }

  let c = 0;
  let f = 0;
  for (const e of empresas) {
    const r = await flushEmpresa(e.id);
    c += r.committed;
    f += r.failed;
  }
  console.log(`Listo. committed≈${c} failed=${f}`);
  process.exit(f > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
