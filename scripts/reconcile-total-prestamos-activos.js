/**
 * Reconcilia `usuarios/{adminId}.totalPrestamosActivos` con el conteo real
 * de préstamos en cobro (estado activo + saldoPendiente > 0).
 *
 * Uso:
 *   node scripts/reconcile-total-prestamos-activos.js
 *   node scripts/reconcile-total-prestamos-activos.js --dry-run
 *   node scripts/reconcile-total-prestamos-activos.js --empresa=<empresaId>
 *
 * Requiere serviceAccountKey.json en la raíz del proyecto.
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const EMPRESAS_COLLECTION = "empresas";
const USUARIOS_SUBCOLLECTION = "usuarios";
const PRESTAMOS_SUBCOLLECTION = "prestamos";
const BATCH_LIMIT = 400;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const empresaArg = args.find((a) => a.startsWith("--empresa="));
const empresaFilter = empresaArg ? empresaArg.slice("--empresa=".length).trim() : "";

function isPrestamoEnCobro(d) {
  const estado = d.estado === "pagado" || d.estado === "castigado" ? d.estado : "activo";
  const saldo = typeof d.saldoPendiente === "number" ? d.saldoPendiente : 0;
  return estado === "activo" && saldo > 0;
}

async function reconcileEmpresa(empresaId) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const prestamosSnap = await empresaRef.collection(PRESTAMOS_SUBCOLLECTION).get();

  /** @type {Map<string, number>} */
  const countByAdmin = new Map();
  for (const doc of prestamosSnap.docs) {
    const d = doc.data();
    if (!isPrestamoEnCobro(d)) continue;
    const adminId = typeof d.adminId === "string" ? d.adminId.trim() : "";
    if (!adminId) continue;
    countByAdmin.set(adminId, (countByAdmin.get(adminId) ?? 0) + 1);
  }

  const usuariosSnap = await empresaRef.collection(USUARIOS_SUBCOLLECTION).get();

  const updates = [];
  const seen = new Set();

  for (const uDoc of usuariosSnap.docs) {
    const role = uDoc.data().role;
    const isAdminPanel = role === "admin" || role === "adminEmpresa";
    const expected = countByAdmin.get(uDoc.id) ?? 0;
    const current =
      typeof uDoc.data().totalPrestamosActivos === "number"
        ? uDoc.data().totalPrestamosActivos
        : 0;

    // Solo admins del panel, o cualquiera con drift / préstamos a su nombre.
    if (!isAdminPanel && expected === 0 && current === 0) continue;

    seen.add(uDoc.id);
    if (current !== expected) {
      updates.push({ uid: uDoc.id, current, expected });
    }
  }

  // Admins con préstamos pero sin documento de rol (edge): aún así corregir.
  for (const [adminId, expected] of countByAdmin.entries()) {
    if (seen.has(adminId)) continue;
    const uRef = empresaRef.collection(USUARIOS_SUBCOLLECTION).doc(adminId);
    const uSnap = await uRef.get();
    const current =
      uSnap.exists && typeof uSnap.data().totalPrestamosActivos === "number"
        ? uSnap.data().totalPrestamosActivos
        : 0;
    if (current !== expected) {
      updates.push({ uid: adminId, current, expected });
    }
  }

  if (updates.length === 0) {
    console.log(`[${empresaId}] OK — sin drift`);
    return { empresaId, fixed: 0 };
  }

  console.log(`[${empresaId}] drift en ${updates.length} admin(s):`);
  for (const u of updates) {
    console.log(`  ${u.uid}: ${u.current} → ${u.expected}`);
  }

  if (dryRun) {
    return { empresaId, fixed: 0, wouldFix: updates.length };
  }

  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    updates.slice(i, i + BATCH_LIMIT).forEach((u) => {
      const ref = empresaRef.collection(USUARIOS_SUBCOLLECTION).doc(u.uid);
      batch.set(ref, { totalPrestamosActivos: u.expected }, { merge: true });
    });
    await batch.commit();
  }

  return { empresaId, fixed: updates.length };
}

async function main() {
  console.log(
    dryRun
      ? "Reconcile totalPrestamosActivos (DRY-RUN)"
      : "Reconcile totalPrestamosActivos"
  );

  let empresas;
  if (empresaFilter) {
    empresas = [{ id: empresaFilter }];
  } else {
    const snap = await db.collection(EMPRESAS_COLLECTION).get();
    empresas = snap.docs.map((d) => ({ id: d.id }));
  }

  let fixedTotal = 0;
  for (const e of empresas) {
    const r = await reconcileEmpresa(e.id);
    fixedTotal += r.fixed ?? 0;
  }

  console.log(
    dryRun
      ? `Listo (dry-run). Revisa los drifts arriba.`
      : `Listo. Admins corregidos: ${fixedTotal}.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
