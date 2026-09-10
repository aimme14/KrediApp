/**
 * Compara los saldos proyectados del ledger (`walletBalances`) contra los
 * saldos operativos reales. SOLO LECTURA: reporta divergencias, no corrige.
 *
 * Una divergencia significa que algún movimiento no llegó al ledger (revisa el
 * outbox con scripts/flush-ledger-outbox.js) o que se tocó un saldo por fuera
 * de los flujos de la aplicación.
 *
 * Uso:
 *   node scripts/reconcile-ledger.js
 *   node scripts/reconcile-ledger.js --empresa=<empresaId>
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
const OUTBOX = "financialLedgerOutbox";
const WALLETS = "walletBalances";

const TOLERANCIA_COP = 0.02;

const args = process.argv.slice(2);
const empresaArg = args.find((a) => a.startsWith("--empresa="));
const empresaFilter = empresaArg ? empresaArg.slice("--empresa=".length).trim() : "";

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toMoney(n) {
  return Math.round(n * 100) / 100;
}

async function saldosOperativos(empresaId) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const saldos = new Map();

  const cajaEmpresaSnap = await empresaRef
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_CAJA_EMPRESA_DOC)
    .get();
  if (cajaEmpresaSnap.exists) {
    saldos.set(
      `empresa_caja:${empresaId}`,
      toMoney(num(cajaEmpresaSnap.data().cajaEmpresa))
    );
  }

  const usuariosSnap = await empresaRef.collection(USUARIOS_SUBCOLLECTION).get();
  for (const doc of usuariosSnap.docs) {
    const u = doc.data();
    const rol = u.rol ?? u.role;
    if (rol === "admin" || rol === "adminEmpresa") {
      saldos.set(`admin_caja:${doc.id}`, toMoney(num(u.cajaAdmin)));
    }
    if (rol === "empleado") {
      saldos.set(`empleado_caja:${doc.id}`, toMoney(num(u.cajaEmpleado)));
    }
  }

  const rutasSnap = await empresaRef.collection(RUTAS_SUBCOLLECTION).get();
  for (const doc of rutasSnap.docs) {
    saldos.set(`ruta_caja:${doc.id}`, toMoney(num(doc.data().cajaRuta)));
  }

  return saldos;
}

async function reconcileEmpresa(empresaId) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const operativos = await saldosOperativos(empresaId);

  const walletsSnap = await empresaRef.collection(WALLETS).get();
  const proyectados = new Map();
  for (const doc of walletsSnap.docs) {
    proyectados.set(doc.id, toMoney(num(doc.data().balance)));
  }

  const divergencias = [];

  for (const [walletId, operativo] of operativos.entries()) {
    if (!proyectados.has(walletId)) {
      divergencias.push({ walletId, tipo: "sin_proyeccion", operativo });
      continue;
    }
    const proyectado = proyectados.get(walletId);
    if (Math.abs(proyectado - operativo) > TOLERANCIA_COP) {
      divergencias.push({
        walletId,
        tipo: "saldo_divergente",
        operativo,
        proyectado,
        diferencia: toMoney(proyectado - operativo),
      });
    }
  }

  for (const walletId of proyectados.keys()) {
    if (!operativos.has(walletId)) {
      divergencias.push({
        walletId,
        tipo: "proyeccion_huerfana",
        proyectado: proyectados.get(walletId),
      });
    }
  }

  const pendingSnap = await empresaRef
    .collection(OUTBOX)
    .where("status", "==", "pending")
    .get();

  if (divergencias.length === 0 && pendingSnap.empty) {
    console.log(`[${empresaId}] OK — ledger cuadrado (${operativos.size} wallets)`);
  } else {
    if (!pendingSnap.empty) {
      console.log(
        `[${empresaId}] ${pendingSnap.size} movimiento(s) pending en el outbox — corre scripts/flush-ledger-outbox.js`
      );
    }
    for (const d of divergencias) {
      console.log(`  [${d.tipo}] ${d.walletId} ${JSON.stringify(d)}`);
    }
  }

  return { divergencias: divergencias.length, pending: pendingSnap.size };
}

async function main() {
  console.log("Reconciliación ledger vs saldos operativos (solo lectura)\n");

  let empresaIds;
  if (empresaFilter) {
    empresaIds = [empresaFilter];
  } else {
    const snap = await db.collection(EMPRESAS_COLLECTION).get();
    empresaIds = snap.docs.map((d) => d.id);
  }

  let divergencias = 0;
  let pending = 0;
  for (const empresaId of empresaIds) {
    const r = await reconcileEmpresa(empresaId);
    divergencias += r.divergencias;
    pending += r.pending;
  }

  console.log(
    `\nTotal: ${divergencias} divergencia(s), ${pending} movimiento(s) pending.`
  );
  process.exit(divergencias > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
