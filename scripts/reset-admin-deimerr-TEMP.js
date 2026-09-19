/**
 * TEMPORAL: vacía toda la operación de un admin (por email) sin borrar cuentas.
 * - Conserva Auth + Firestore del admin y de sus trabajadores.
 * - Elimina rutas, clientes, préstamos, pagos, reportes, gastos, etc.
 * - Deja trabajadores sin ruta asignada (rutaId eliminado, cajaEmpleado = 0).
 * - La plata de las rutas NO se transfiere a cajaAdmin — desaparece del patrimonio.
 *
 * Uso:
 *   node scripts/reset-admin-deimerr-TEMP.js --dry-run
 *   node scripts/reset-admin-deimerr-TEMP.js --dry-run --email=deimerr@gmail.com
 *   CONFIRM=1 node scripts/reset-admin-deimerr-TEMP.js --email=deimerr@gmail.com
 *   CONFIRM=1 node scripts/reset-admin-deimerr-TEMP.js --email=... --empresa=<id>
 *
 * Requiere .env.local (FIREBASE_*) o serviceAccountKey.json en la raíz.
 */

const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
for (const p of [
  path.join(root, ".env.local"),
  path.join(root, ".env"),
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
]) {
  if (fs.existsSync(p)) require("dotenv").config({ path: p });
}

const admin = require("firebase-admin");

function initFirebase() {
  if (admin.apps.length) return;
  const keyPath = path.join(root, "serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
    });
    return;
  }
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan credenciales: serviceAccountKey.json o FIREBASE_* en .env.local"
    );
  }
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

initFirebase();
const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const EMPRESAS = "empresas";
const USERS = "users";
const BATCH_LIMIT = 400;
const DEFAULT_EMAIL = "deimerr@gmail.com";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirm = process.env.CONFIRM === "1";
const targetEmail =
  args.find((a) => a.startsWith("--email="))?.slice("--email=".length).trim().toLowerCase() ||
  DEFAULT_EMAIL;
const empresaFilter =
  args.find((a) => a.startsWith("--empresa="))?.slice("--empresa=".length).trim() || "";

const COLS_BY_RUTA = [
  "prestamos",
  "clientes",
  "gastosAdministrador",
  "gastosEmpleado",
  "reportesDia",
  "solicitudesEntregaReporte",
  "solicitudesPrestamo",
];

const COLS_BY_ADMIN = [
  "gastosAdministrador",
  "gastosEmpleado",
  "reportesDia",
  "solicitudesEntregaReporte",
  "solicitudesPrestamo",
  "periodosAdmin",
  "clientes",
  "prestamos",
];

const ADMIN_USER_SUBCOLS = [
  "inversionesCajaRuta",
  "inversionesRutaCajaAdmin",
  "ingresosBaseAdminEmpresa",
];

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function capitalRutaFromData(d) {
  if (typeof d.capitalTotal === "number") return roundMoney(d.capitalTotal);
  const cajaRuta = typeof d.cajaRuta === "number" ? d.cajaRuta : 0;
  const cajasEmpleados = typeof d.cajasEmpleados === "number" ? d.cajasEmpleados : 0;
  const inversiones = typeof d.inversiones === "number" ? d.inversiones : 0;
  return roundMoney(cajaRuta + cajasEmpleados + inversiones);
}

function isPrestamoEnCobro(d) {
  const estado = d.estado === "pagado" || d.estado === "castigado" ? d.estado : "activo";
  const saldo = typeof d.saldoPendiente === "number" ? d.saldoPendiente : 0;
  return estado === "activo" && saldo > 0;
}

async function deleteDocsBatch(refs, label) {
  if (refs.length === 0) return 0;
  if (dryRun) {
    console.log(`  [dry-run] ${label}: ${refs.length} docs`);
    return refs.length;
  }
  let deleted = 0;
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += Math.min(BATCH_LIMIT, refs.length - i);
  }
  console.log(`  ${label}: ${deleted} docs eliminados`);
  return deleted;
}

async function deleteCollection(ref, label) {
  let total = 0;
  while (true) {
    const snap = await ref.limit(BATCH_LIMIT).get();
    if (snap.empty) break;
    total += await deleteDocsBatch(
      snap.docs.map((d) => d.ref),
      label
    );
    if (dryRun) break;
  }
  return total;
}

async function deleteQueryWhere(empresaRef, collection, field, value, label) {
  const snap = await empresaRef.collection(collection).where(field, "==", value).get();
  return deleteDocsBatch(
    snap.docs.map((d) => d.ref),
    label || `${collection}[${field}=${value}]`
  );
}

async function deletePagosPrestamos(empresaRef, filterField, filterValue) {
  const prestamos = await empresaRef
    .collection("prestamos")
    .where(filterField, "==", filterValue)
    .get();
  let total = 0;
  for (const p of prestamos.docs) {
    total += await deleteCollection(p.ref.collection("pagos"), `pagos/${p.id}`);
  }
  return total;
}

async function syncCustomClaimsForUid(uid) {
  const userSnap = await db.collection(USERS).doc(uid).get();
  if (!userSnap.exists) {
    if (!dryRun) await auth.setCustomUserClaims(uid, null);
    return;
  }
  const data = userSnap.data();
  const roleRaw = data.role;
  if (!["jefe", "admin", "adminEmpresa", "empleado"].includes(roleRaw)) {
    if (!dryRun) await auth.setCustomUserClaims(uid, null);
    return;
  }
  const claims = {
    role: roleRaw,
    empresaId: typeof data.empresaId === "string" ? data.empresaId : "",
    enabled: data.enabled !== false,
  };
  if (typeof data.rutaId === "string" && data.rutaId.trim()) {
    claims.rutaId = data.rutaId.trim();
  }
  if (typeof data.adminId === "string" && data.adminId.trim()) {
    claims.adminId = data.adminId.trim();
  }
  if (!dryRun) {
    await auth.setCustomUserClaims(uid, claims);
    console.log(`  Custom claims actualizados: ${uid}`);
  } else {
    console.log(`  [dry-run] actualizaría custom claims: ${uid}`);
  }
}

async function resolveAdminByEmail(email) {
  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
  } catch (e) {
    const code = e && e.code;
    if (code === "auth/user-not-found") {
      throw new Error(`No existe usuario Auth con email ${email}`);
    }
    throw e;
  }

  const adminUid = authUser.uid;
  const userSnap = await db.collection(USERS).doc(adminUid).get();
  if (!userSnap.exists) {
    throw new Error(`users/${adminUid} no existe para ${email}`);
  }

  const userData = userSnap.data();
  const role = userData.role;
  if (role !== "admin" && role !== "adminEmpresa") {
    throw new Error(
      `${email} tiene rol "${role}" — este script solo aplica a admin o adminEmpresa`
    );
  }

  const empresaId = typeof userData.empresaId === "string" ? userData.empresaId.trim() : "";
  if (!empresaId) throw new Error(`users/${adminUid} sin empresaId`);

  if (empresaFilter && empresaId !== empresaFilter) {
    throw new Error(
      `${email} pertenece a empresa ${empresaId}, no a ${empresaFilter}`
    );
  }

  const adminEmpSnap = await db
    .collection(EMPRESAS)
    .doc(empresaId)
    .collection("usuarios")
    .doc(adminUid)
    .get();

  if (!adminEmpSnap.exists) {
    throw new Error(`empresas/${empresaId}/usuarios/${adminUid} no existe`);
  }

  const adminData = adminEmpSnap.data();
  return {
    adminUid,
    empresaId,
    email,
    nombre: adminData.nombre || userData.displayName || email,
    rol: adminData.rol || role,
    cajaAdmin: typeof adminData.cajaAdmin === "number" ? adminData.cajaAdmin : 0,
    totalClientes: typeof adminData.totalClientes === "number" ? adminData.totalClientes : 0,
    totalPrestamosActivos:
      typeof adminData.totalPrestamosActivos === "number"
        ? adminData.totalPrestamosActivos
        : 0,
    totalMorosos: typeof adminData.totalMorosos === "number" ? adminData.totalMorosos : 0,
  };
}

async function resolveTrabajadores(empresaRef, adminUid) {
  const snap = await empresaRef
    .collection("usuarios")
    .where("adminId", "==", adminUid)
    .where("rol", "==", "empleado")
    .get();

  const trabajadores = [];
  for (const d of snap.docs) {
    const ed = d.data();
    const userSnap = await db.collection(USERS).doc(d.id).get();
    const ud = userSnap.exists ? userSnap.data() : {};
    trabajadores.push({
      uid: d.id,
      nombre: ed.nombre || ud.displayName || d.id,
      email: ed.email || ud.email || "",
      rutaId: typeof ed.rutaId === "string" ? ed.rutaId.trim() : "",
      cajaEmpleado: typeof ed.cajaEmpleado === "number" ? ed.cajaEmpleado : 0,
    });
  }
  return trabajadores;
}

async function computeAdminSnapshot(empresaId, adminId) {
  const empresaRef = db.collection(EMPRESAS).doc(empresaId);
  const [adminSnap, rutasSnap] = await Promise.all([
    empresaRef.collection("usuarios").doc(adminId).get(),
    empresaRef.collection("rutas").where("adminId", "==", adminId).get(),
  ]);
  const cajaAdmin =
    adminSnap.exists && typeof adminSnap.data()?.cajaAdmin === "number"
      ? adminSnap.data().cajaAdmin
      : 0;
  let sumaCapitalRutas = 0;
  let gananciasTotales = 0;
  const rutasDetalle = [];
  for (const d of rutasSnap.docs) {
    const data = d.data();
    const cap = capitalRutaFromData(data);
    const gan = typeof data.ganancias === "number" ? data.ganancias : 0;
    sumaCapitalRutas += cap;
    gananciasTotales += gan;
    rutasDetalle.push({
      rutaId: d.id,
      codigo: data.codigo,
      nombre: data.nombre,
      capital: cap,
      ganancias: gan,
    });
  }
  return {
    cajaAdmin,
    capitalAdmin: roundMoney(cajaAdmin + sumaCapitalRutas),
    gananciasTotales: roundMoney(gananciasTotales),
    rutasCount: rutasSnap.size,
    rutasDetalle,
    rutasSnap,
  };
}

async function countPagosForFilter(empresaRef, filterField, filterValue) {
  const prestamos = await empresaRef
    .collection("prestamos")
    .where(filterField, "==", filterValue)
    .get();
  let n = 0;
  for (const p of prestamos.docs) {
    n += (await p.ref.collection("pagos").get()).size;
  }
  return n;
}

async function deleteInversionesHistorialAdmin(empresaRef, adminId, rutaId) {
  const adminUserRef = empresaRef.collection("usuarios").doc(adminId);
  let total = 0;
  for (const sub of ["inversionesCajaRuta", "inversionesRutaCajaAdmin"]) {
    const snap = await adminUserRef.collection(sub).where("rutaId", "==", rutaId).get();
    total += await deleteDocsBatch(snap.docs.map((d) => d.ref), `${sub}[rutaId=${rutaId}]`);
  }
  return total;
}

async function deleteRutaCascade(empresaRef, adminId, rutaDoc) {
  const rutaId = rutaDoc.id;
  const rd = rutaDoc.data();
  console.log(`\n--- Ruta ${rd.codigo || rutaId} (${rd.nombre || ""}) ---`);

  await deletePagosPrestamos(empresaRef, "rutaId", rutaId);
  for (const col of COLS_BY_RUTA) {
    await deleteQueryWhere(empresaRef, col, "rutaId", rutaId, col);
  }

  const movSnap = await empresaRef
    .collection("financialMovements")
    .where("rutaId", "==", rutaId)
    .get();
  await deleteDocsBatch(movSnap.docs.map((d) => d.ref), `financialMovements[rutaId=${rutaId}]`);

  await deleteDocsBatch(
    [
      empresaRef.collection("walletBalances").doc(`ruta_caja:${rutaId}`),
      empresaRef.collection("walletBalances").doc(`ruta_inversiones:${rutaId}`),
    ],
    `walletBalances ruta ${rutaId}`
  );

  await deleteInversionesHistorialAdmin(empresaRef, adminId, rutaId);

  const snapRef = empresaRef.collection("capital").doc("root").collection("rutas").doc(rutaId);
  await deleteDocsBatch([snapRef], `capital/root/rutas/${rutaId}`);

  if (!dryRun) {
    await rutaDoc.ref.delete();
    console.log(`  Documento rutas/${rutaId} eliminado`);
  } else {
    console.log(`  [dry-run] eliminaría rutas/${rutaId}`);
  }
}

async function deleteAdminScopedData(empresaRef, adminId) {
  console.log("\n--- Datos restantes por adminId ---");

  await deletePagosPrestamos(empresaRef, "adminId", adminId);
  for (const col of COLS_BY_ADMIN) {
    await deleteQueryWhere(empresaRef, col, "adminId", adminId, col);
  }

  const movSnap = await empresaRef
    .collection("financialMovements")
    .where("adminId", "==", adminId)
    .get();
  await deleteDocsBatch(movSnap.docs.map((d) => d.ref), "financialMovements[adminId]");

  for (const col of ["financialOperations", "financialLedgerOutbox"]) {
    const snap = await empresaRef.collection(col).where("adminId", "==", adminId).get();
    if (!snap.empty) {
      await deleteDocsBatch(snap.docs.map((d) => d.ref), col);
    }
  }

  const adminUserRef = empresaRef.collection("usuarios").doc(adminId);
  for (const sub of ADMIN_USER_SUBCOLS) {
    await deleteCollection(adminUserRef.collection(sub), `usuarios/${adminId}/${sub}`);
  }

  await deleteDocsBatch(
    [empresaRef.collection("walletBalances").doc(`admin_caja:${adminId}`)],
    `walletBalances admin_caja:${adminId}`
  );
}

async function deleteEmpleadoScopedData(empresaRef, empUid) {
  for (const col of ["gastosEmpleado", "reportesDia", "solicitudesPrestamo"]) {
    for (const field of ["empleadoId", "empleadoUid"]) {
      const snap = await empresaRef.collection(col).where(field, "==", empUid).get();
      if (!snap.empty) {
        await deleteDocsBatch(snap.docs.map((d) => d.ref), `${col}[${field}=${empUid}]`);
      }
    }
  }
}

async function resetTrabajador(empresaRef, trabajador) {
  const { uid, nombre, email } = trabajador;
  console.log(`\n--- Reset trabajador: ${nombre} <${email}> uid=${uid} ---`);

  await deleteCollection(
    empresaRef.collection("usuarios").doc(uid).collection("asignacionesBase"),
    `asignacionesBase/${uid}`
  );

  await deleteEmpleadoScopedData(empresaRef, uid);

  await deleteDocsBatch(
    [empresaRef.collection("walletBalances").doc(`empleado_caja:${uid}`)],
    `walletBalances empleado_caja:${uid}`
  );

  const now = new Date();
  if (!dryRun) {
    await empresaRef
      .collection("usuarios")
      .doc(uid)
      .set(
        {
          rutaId: FieldValue.delete(),
          cajaEmpleado: 0,
          ultimaActualizacionCapital: now,
        },
        { merge: true }
      );
    await db
      .collection(USERS)
      .doc(uid)
      .set({ rutaId: FieldValue.delete(), updatedAt: now }, { merge: true });
    console.log(`  Trabajador reseteado (sin ruta, cajaEmpleado=0)`);
  } else {
    console.log(`  [dry-run] resetearía rutaId/cajaEmpleado en usuarios/${uid} y users/${uid}`);
  }

  await syncCustomClaimsForUid(uid);
}

async function resetAdmin(empresaRef, adminUid) {
  console.log(`\n--- Reset admin uid=${adminUid} (conservar cuenta) ---`);
  const now = new Date();
  if (!dryRun) {
    await empresaRef.collection("usuarios").doc(adminUid).set(
      {
        cajaAdmin: 0,
        totalClientes: 0,
        totalPrestamosActivos: 0,
        totalMorosos: 0,
        ultimaActualizacionCapital: now,
      },
      { merge: true }
    );
    console.log("  Admin reseteado (cajaAdmin=0, contadores=0)");
  } else {
    console.log("  [dry-run] resetearía cajaAdmin y contadores del admin");
  }
}

async function persistAggregatedCapitalDocs(empresaId) {
  if (dryRun) {
    console.log("  [dry-run] persistAggregatedCapitalDocs");
    return;
  }
  const empresaRef = db.collection(EMPRESAS).doc(empresaId);
  const rutasSnap = await empresaRef.collection("rutas").get();
  let sumaCapitalAdmins = 0;
  const adminsSnap = await empresaRef
    .collection("usuarios")
    .where("rol", "in", ["admin", "adminEmpresa"])
    .get();
  for (const adminDoc of adminsSnap.docs) {
    const adminUid = adminDoc.id;
    const cajaAdmin =
      typeof adminDoc.data()?.cajaAdmin === "number" ? adminDoc.data().cajaAdmin : 0;
    let sumaRutas = 0;
    for (const r of rutasSnap.docs) {
      if (r.data().adminId !== adminUid) continue;
      sumaRutas += capitalRutaFromData(r.data());
    }
    sumaCapitalAdmins += cajaAdmin + sumaRutas;
  }
  let sumaCajasEmpleados = 0;
  for (const r of rutasSnap.docs) {
    const c = r.data().cajasEmpleados;
    if (typeof c === "number") sumaCajasEmpleados += c;
  }
  const now = new Date();
  const capitalRef = empresaRef.collection("capital");
  await Promise.all([
    capitalRef.doc("cajaAdmin").set({ sumaCapitalAdmins, updatedAt: now }, { merge: true }),
    capitalRef
      .doc("cajaEmpleado")
      .set({ sumaCajasEmpleados, updatedAt: now }, { merge: true }),
  ]);
  const branchRef = capitalRef.doc("root");
  await branchRef.set({ kind: "capitalBranch", updatedAt: now }, { merge: true });

  const existingRutaIds = new Set(rutasSnap.docs.map((d) => d.id));
  const snapRutasCol = branchRef.collection("rutas");
  const allSnaps = await snapRutasCol.get();
  for (const d of allSnaps.docs) {
    if (!existingRutaIds.has(d.id)) {
      await d.ref.delete();
    }
  }

  for (let i = 0; i < rutasSnap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const d of rutasSnap.docs.slice(i, i + BATCH_LIMIT)) {
      const data = d.data();
      const payload = {
        rutaId: d.id,
        nombre: data.nombre || "",
        adminId: data.adminId || "",
        cajaRuta: data.cajaRuta ?? 0,
        cajasEmpleados: data.cajasEmpleados ?? 0,
        inversiones: data.inversiones ?? 0,
        ganancias: data.ganancias ?? 0,
        perdidas: data.perdidas ?? 0,
        capitalRuta: capitalRutaFromData(data),
        updatedAt: now,
      };
      batch.set(snapRutasCol.doc(d.id), payload, { merge: true });
    }
    await batch.commit();
  }
  console.log("  Agregados capital/cajaAdmin y snapshots de rutas actualizados");
}

async function main() {
  console.log(
    dryRun
      ? "=== RESET ADMIN (DRY-RUN) ==="
      : confirm
        ? "=== RESET ADMIN (EJECUCIÓN REAL) ==="
        : "=== RESET ADMIN (preview — usa CONFIRM=1 para ejecutar) ==="
  );
  console.log(`Email objetivo: ${targetEmail}\n`);

  const adminInfo = await resolveAdminByEmail(targetEmail);
  const { adminUid, empresaId, nombre, rol } = adminInfo;
  const empresaRef = db.collection(EMPRESAS).doc(empresaId);

  const before = await computeAdminSnapshot(empresaId, adminUid);
  const trabajadores = await resolveTrabajadores(empresaRef, adminUid);

  const [clientesCount, prestamosSnap, morososCount, pagosCount] = await Promise.all([
    (await empresaRef.collection("clientes").where("adminId", "==", adminUid).get()).size,
    empresaRef.collection("prestamos").where("adminId", "==", adminUid).get(),
    (
      await empresaRef
        .collection("clientes")
        .where("adminId", "==", adminUid)
        .where("moroso", "==", true)
        .get()
    ).size,
    countPagosForFilter(empresaRef, "adminId", adminUid),
  ]);

  const prestamosActivos = prestamosSnap.docs.filter((d) => isPrestamoEnCobro(d.data())).length;
  const capitalRutas = before.rutasDetalle.reduce((s, r) => s + r.capital, 0);
  const gananciasRutas = before.rutasDetalle.reduce((s, r) => s + r.ganancias, 0);

  console.log("=== ADMIN (SE CONSERVA) ===");
  console.log({
    adminUid,
    email: targetEmail,
    nombre,
    rol,
    empresaId,
    cajaAdmin: adminInfo.cajaAdmin,
  });

  console.log("\n=== TRABAJADORES (SE CONSERVAN, sin ruta al final) ===");
  if (trabajadores.length === 0) console.log("  (ninguno)");
  else {
    for (const t of trabajadores) {
      console.log(
        `  ${t.nombre} <${t.email}> uid=${t.uid} rutaId=${t.rutaId || "(ninguna)"} caja=$${t.cajaEmpleado}`
      );
    }
  }

  console.log("\n=== RUTAS A ELIMINAR ===");
  if (before.rutasDetalle.length === 0) console.log("  (ninguna)");
  else {
    for (const r of before.rutasDetalle) {
      console.log(`  ${r.codigo || r.rutaId} ${r.nombre}: capital=$${r.capital}, ganancias=$${r.ganancias}`);
    }
  }

  console.log("\n=== ENTIDADES A ELIMINAR ===");
  console.log({
    rutas: before.rutasCount,
    clientes: clientesCount,
    prestamos: prestamosSnap.size,
    prestamosActivos,
    morosos: morososCount,
    pagos: pagosCount,
  });

  console.log("\n=== IMPACTO ESPERADO EN DASHBOARD ===");
  console.log({
    rutasActivas: `${before.rutasCount} → 0`,
    clientes: `${adminInfo.totalClientes} → 0`,
    prestamosActivos: `${adminInfo.totalPrestamosActivos} → 0`,
    morosos: `${adminInfo.totalMorosos} → 0`,
    cajaAdmin: `${adminInfo.cajaAdmin} → 0`,
    capitalActual: `${before.capitalAdmin} → 0`,
    ganancias: `${before.gananciasTotales} → 0`,
    capitalRutasEliminado: roundMoney(capitalRutas),
    gananciasRutasEliminadas: roundMoney(gananciasRutas),
  });

  if (dryRun || !confirm) {
    console.log(
      dryRun
        ? "\n[DRY-RUN] Finalizado. Nada fue modificado."
        : "\nEjecuta con CONFIRM=1 (sin --dry-run) para aplicar cambios."
    );
    return;
  }

  console.log("\n=== INICIANDO RESET ===");

  for (const rutaDoc of before.rutasSnap.docs) {
    await deleteRutaCascade(empresaRef, adminUid, rutaDoc);
  }

  await deleteAdminScopedData(empresaRef, adminUid);

  for (const t of trabajadores) {
    await resetTrabajador(empresaRef, t);
  }

  await resetAdmin(empresaRef, adminUid);
  await persistAggregatedCapitalDocs(empresaId);

  const after = await computeAdminSnapshot(empresaId, adminUid);
  const trabajadoresAfter = await resolveTrabajadores(empresaRef, adminUid);

  console.log("\n=== VERIFICACIÓN AFTER ===");
  console.log({
    rutas: { before: before.rutasCount, after: after.rutasCount },
    capitalAdmin: { before: before.capitalAdmin, after: after.capitalAdmin },
    cajaAdmin: { before: before.cajaAdmin, after: after.cajaAdmin },
    ganancias: { before: before.gananciasTotales, after: after.gananciasTotales },
    trabajadoresConservados: trabajadoresAfter.length,
    trabajadoresSinRuta: trabajadoresAfter.filter((t) => !t.rutaId).length,
  });

  for (const t of trabajadoresAfter) {
    if (t.rutaId) {
      console.warn(`  ⚠️ Trabajador ${t.email} aún tiene rutaId=${t.rutaId}`);
    }
    if (t.cajaEmpleado !== 0) {
      console.warn(`  ⚠️ Trabajador ${t.email} cajaEmpleado=${t.cajaEmpleado} (esperado 0)`);
    }
  }

  const okRutas = after.rutasCount === 0;
  const okCapital = after.capitalAdmin === 0;
  const okCaja = after.cajaAdmin === 0;
  const okTrabajadores =
    trabajadoresAfter.length === trabajadores.length &&
    trabajadoresAfter.every((t) => !t.rutaId && t.cajaEmpleado === 0);

  if (!okRutas || !okCapital || !okCaja || !okTrabajadores) {
    console.error("\n⚠️ VERIFICACIÓN CON ADVERTENCIAS — revisa manualmente el dashboard");
    process.exit(2);
  }

  console.log("\n✅ Reset completado. Admin y trabajadores conservados.");
  console.log("Recarga el dashboard para confirmar visualmente.");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
