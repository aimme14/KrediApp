/**
 * Siembra `walletBalances` a partir de los saldos operativos actuales.
 *
 * Encender el ledger sin esto dejaría los saldos proyectados en cero y todo
 * descuadrado frente a la caja real. Escribe un movimiento de apertura por
 * wallet (`saldo_inicial_bootstrap`) para que el histórico arranque cuadrado.
 *
 * Es aditivo: no toca ningún saldo operativo. Idempotente: el id del
 * movimiento de apertura es fijo por wallet, así que repetirlo no duplica.
 *
 * Uso:
 *   node scripts/bootstrap-wallet-balances.js               (dry-run por defecto)
 *   node scripts/bootstrap-wallet-balances.js --apply
 *   node scripts/bootstrap-wallet-balances.js --apply --empresa=<empresaId>
 *
 * Requiere serviceAccountKey.json en la raíz del proyecto.
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const EMPRESAS_COLLECTION = "empresas";
const USUARIOS_SUBCOLLECTION = "usuarios";
const RUTAS_SUBCOLLECTION = "rutas";
const CAPITAL_SUBCOLLECTION = "capital";
const CAPITAL_CAJA_EMPRESA_DOC = "cajaEmpresa";
const MOVEMENTS = "financialMovements";
const WALLETS = "walletBalances";
const BATCH_LIMIT = 200;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const empresaArg = args.find((a) => a.startsWith("--empresa="));
const empresaFilter = empresaArg ? empresaArg.slice("--empresa=".length).trim() : "";

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toMoney(n) {
  return Math.round(n * 100) / 100;
}

/** Wallets con saldo operativo actual de una empresa. */
async function recolectarWallets(empresaId) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const wallets = [];

  const cajaEmpresaSnap = await empresaRef
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_CAJA_EMPRESA_DOC)
    .get();
  if (cajaEmpresaSnap.exists) {
    wallets.push({
      walletType: "empresa_caja",
      walletId: empresaId,
      scope: "empresa",
      balance: toMoney(num(cajaEmpresaSnap.data().cajaEmpresa)),
    });
  }

  const usuariosSnap = await empresaRef.collection(USUARIOS_SUBCOLLECTION).get();
  for (const doc of usuariosSnap.docs) {
    const u = doc.data();
    const rol = u.rol ?? u.role;
    if (rol === "admin" || rol === "adminEmpresa") {
      wallets.push({
        walletType: "admin_caja",
        walletId: doc.id,
        scope: "admin",
        balance: toMoney(num(u.cajaAdmin)),
      });
    }
    if (rol === "empleado") {
      wallets.push({
        walletType: "empleado_caja",
        walletId: doc.id,
        scope: "empleado",
        balance: toMoney(num(u.cajaEmpleado)),
      });
    }
  }

  const rutasSnap = await empresaRef.collection(RUTAS_SUBCOLLECTION).get();
  for (const doc of rutasSnap.docs) {
    wallets.push({
      walletType: "ruta_caja",
      walletId: doc.id,
      scope: "ruta",
      balance: toMoney(num(doc.data().cajaRuta)),
    });
  }

  return wallets;
}

async function bootstrapEmpresa(empresaId) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const wallets = await recolectarWallets(empresaId);

  const pendientes = [];
  for (const w of wallets) {
    const docId = `${w.walletType}:${w.walletId}`;
    const existing = await empresaRef.collection(WALLETS).doc(docId).get();
    // Solo se siembra lo que no existe: nunca se pisa un saldo ya proyectado.
    if (existing.exists) continue;
    pendientes.push({ ...w, docId });
  }

  if (pendientes.length === 0) {
    console.log(`[${empresaId}] OK — todas las wallets ya existen (${wallets.length})`);
    return { creadas: 0 };
  }

  console.log(`[${empresaId}] ${pendientes.length} wallet(s) por sembrar:`);
  for (const w of pendientes) {
    console.log(`  ${w.docId} = ${w.balance}`);
  }

  if (!apply) return { creadas: 0, wouldCreate: pendientes.length };

  const now = new Date();
  for (let i = 0; i < pendientes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const w of pendientes.slice(i, i + BATCH_LIMIT)) {
      const operationId = `bootstrap:${w.docId}`;

      batch.set(
        empresaRef.collection(WALLETS).doc(w.docId),
        {
          walletType: w.walletType,
          walletId: w.walletId,
          balance: w.balance,
          currency: "COP",
          updatedAt: now,
          lastMovementId: operationId,
          lastOperationId: operationId,
          bootstrappedAt: now,
        },
        { merge: true }
      );

      batch.set(
        empresaRef.collection(MOVEMENTS).doc(operationId),
        {
          movementId: operationId,
          operationId,
          empresaId,
          walletType: w.walletType,
          walletId: w.walletId,
          direction: w.balance >= 0 ? "credit" : "debit",
          amount: Math.abs(w.balance),
          signedAmount: w.balance,
          currency: "COP",
          eventType: "saldo_inicial_bootstrap",
          scope: w.scope,
          relatedEntityType: "gasto",
          relatedEntityId: operationId,
          metadata: { motivo: "Apertura del ledger sobre saldos operativos" },
          createdBy: "script:bootstrap-wallet-balances",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "committed",
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  return { creadas: pendientes.length };
}

async function main() {
  console.log(
    apply
      ? "Bootstrap de walletBalances"
      : "Bootstrap de walletBalances (DRY-RUN — usa --apply para escribir)"
  );

  let empresaIds;
  if (empresaFilter) {
    empresaIds = [empresaFilter];
  } else {
    const snap = await db.collection(EMPRESAS_COLLECTION).get();
    empresaIds = snap.docs.map((d) => d.id);
  }

  let total = 0;
  for (const empresaId of empresaIds) {
    const r = await bootstrapEmpresa(empresaId);
    total += r.creadas ?? 0;
  }

  console.log(
    apply
      ? `Listo. Wallets sembradas: ${total}.`
      : "Listo (dry-run). Revisa la lista y vuelve a correr con --apply."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
