/**
 * TEMPORAL: elimina ruta RT-004-003 IXTLA y todo lo relacionado.
 * La plata NO se mueve a cajaAdmin — desaparece del patrimonio (borrado en cascada).
 * También elimina la cuenta Auth + Firestore del empleado asignado.
 *
 * Uso:
 *   node scripts/delete-ruta-IXTLA-TEMP.js --dry-run
 *   node scripts/delete-ruta-IXTLA-TEMP.js --dry-run --codigo=RT-004-003
 *   CONFIRM=1 node scripts/delete-ruta-IXTLA-TEMP.js --codigo=RT-004-003
 *   CONFIRM=1 node scripts/delete-ruta-IXTLA-TEMP.js --empresa=<id> --codigo=RT-004-003
 *
 * Requiere .env.local (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
 * o serviceAccountKey.json en la raíz.
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

const EMPRESAS = "empresas";
const USERS = "users";
const BATCH_LIMIT = 400;
const DEFAULT_CODIGO = "RT-004-003";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirm = process.env.CONFIRM === "1";
const codigo =
  args.find((a) => a.startsWith("--codigo="))?.slice("--codigo=".length).trim() ||
  DEFAULT_CODIGO;
const empresaFilter =
  args.find((a) => a.startsWith("--empresa="))?.slice("--empresa=".length).trim() || "";

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

async function findRuta(empresaId) {
  const empresaRef = db.collection(EMPRESAS).doc(empresaId);
  const snap = await empresaRef.collection("rutas").where("codigo", "==", codigo).limit(2).get();
  if (snap.empty) return null;
  if (snap.size > 1) {
    throw new Error(`Más de una ruta con codigo ${codigo} en empresa ${empresaId}`);
  }
  const doc = snap.docs[0];
  return { empresaId, rutaId: doc.id, data: doc.data(), ref: doc.ref };
}

async function discoverRuta() {
  if (empresaFilter) {
    const found = await findRuta(empresaFilter);
    if (!found) throw new Error(`Ruta ${codigo} no encontrada en empresa ${empresaFilter}`);
    return found;
  }
  const empresasSnap = await db.collection(EMPRESAS).get();
  const matches = [];
  for (const e of empresasSnap.docs) {
    const found = await findRuta(e.id);
    if (found) matches.push(found);
  }
  if (matches.length === 0) throw new Error(`Ruta ${codigo} no encontrada en ninguna empresa`);
  if (matches.length > 1) {
    throw new Error(
      `Ruta ${codigo} encontrada en ${matches.length} empresas; usa --empresa=<id>`
    );
  }
  return matches[0];
}

async function computeAdminSnapshot(empresaId, adminId) {
  const empresaRef = db.collection(EMPRESAS).doc(empresaId);
  const [adminSnap, rutasSnap] = await Promise.all([
    empresaRef.collection("usuarios").doc(adminId).get(),
    empresaRef.collection("rutas").get(),
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
    totalClientes:
      adminSnap.exists && typeof adminSnap.data()?.totalClientes === "number"
        ? adminSnap.data().totalClientes
        : 0,
    totalPrestamosActivos:
      adminSnap.exists && typeof adminSnap.data()?.totalPrestamosActivos === "number"
        ? adminSnap.data().totalPrestamosActivos
        : 0,
    totalMorosos:
      adminSnap.exists && typeof adminSnap.data()?.totalMorosos === "number"
        ? adminSnap.data().totalMorosos
        : 0,
    rutasDetalle,
  };
}

async function countQuery(query) {
  const snap = await query.get();
  return snap.size;
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

async function deletePagosPrestamos(empresaRef, rutaId) {
  const prestamos = await empresaRef.collection("prestamos").where("rutaId", "==", rutaId).get();
  let total = 0;
  for (const p of prestamos.docs) {
    total += await deleteCollection(p.ref.collection("pagos"), `pagos/${p.id}`);
  }
  return total;
}

async function resolveEmpleados(empresaRef, rutaId, rutaData) {
  /** @type {Map<string, object>} */
  const map = new Map();
  const ids = Array.isArray(rutaData.empleadosIds) ? rutaData.empleadosIds : [];
  for (const uid of ids) {
    if (typeof uid === "string" && uid.trim()) map.set(uid.trim(), {});
  }
  if (typeof rutaData.empleadoId === "string" && rutaData.empleadoId.trim()) {
    map.set(rutaData.empleadoId.trim(), {});
  }
  const byRuta = await empresaRef
    .collection("usuarios")
    .where("rutaId", "==", rutaId)
    .get();
  for (const d of byRuta.docs) {
    const rol = d.data().rol;
    if (rol === "empleado" || rol === "trabajador") map.set(d.id, d.data());
  }
  const empleados = [];
  for (const [uid, data] of map.entries()) {
    const userSnap = await db.collection(USERS).doc(uid).get();
    const ud = userSnap.exists ? userSnap.data() : {};
    const empSnap = await empresaRef.collection("usuarios").doc(uid).get();
    const ed = empSnap.exists ? empSnap.data() : data;
    empleados.push({
      uid,
      nombre: ed.nombre || ud.displayName || uid,
      email: ed.email || ud.email || "",
      cajaEmpleado: typeof ed.cajaEmpleado === "number" ? ed.cajaEmpleado : 0,
      rol: ed.rol || ud.role || "",
    });
  }
  return empleados;
}

async function deleteInversionesHistorialAdmin(empresaRef, adminId, rutaId) {
  const adminUserRef = empresaRef.collection("usuarios").doc(adminId);
  let total = 0;
  for (const sub of ["inversionesCajaRuta", "inversionesRutaCajaAdmin"]) {
    const snap = await adminUserRef.collection(sub).where("rutaId", "==", rutaId).get();
    total += await deleteDocsBatch(snap.docs.map((d) => d.ref), sub);
  }
  return total;
}

async function deleteEmpleado(empresaRef, empleado) {
  const { uid, nombre, email } = empleado;
  console.log(`\n--- Eliminando empleado: ${nombre} (${email}) uid=${uid} ---`);

  await deleteCollection(
    empresaRef.collection("usuarios").doc(uid).collection("asignacionesBase"),
    `asignacionesBase/${uid}`
  );

  if (!dryRun) {
    await empresaRef.collection("usuarios").doc(uid).delete().catch(() => {});
    await db.collection(USERS).doc(uid).delete().catch(() => {});
    try {
      await auth.deleteUser(uid);
      console.log(`  Auth eliminado: ${uid}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  Auth delete (${uid}): ${msg}`);
    }
  } else {
    console.log(`  [dry-run] eliminaría empresas/usuarios/${uid}, users/${uid}, Auth`);
  }

  await deleteDocsBatch(
    [
      db
        .collection(EMPRESAS)
        .doc(empresaRef.id)
        .collection("walletBalances")
        .doc(`empleado_caja:${uid}`),
    ].filter((ref) => ref),
    `walletBalances empleado_caja:${uid}`
  );
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
      batch.set(branchRef.collection("rutas").doc(d.id), payload, { merge: true });
    }
    await batch.commit();
  }
  console.log("  Agregados capital/cajaAdmin y snapshots de rutas actualizados");
}

async function reconcileAdminCounters(empresaRef, adminId) {
  const [clientesSnap, prestamosSnap, morososSnap, adminSnap] = await Promise.all([
    empresaRef.collection("clientes").where("adminId", "==", adminId).get(),
    empresaRef.collection("prestamos").get(),
    empresaRef
      .collection("clientes")
      .where("adminId", "==", adminId)
      .where("moroso", "==", true)
      .get(),
    empresaRef.collection("usuarios").doc(adminId).get(),
  ]);
  let prestamosActivos = 0;
  for (const d of prestamosSnap.docs) {
    const x = d.data();
    if (x.adminId !== adminId) continue;
    if (isPrestamoEnCobro(x)) prestamosActivos++;
  }
  const expected = {
    totalClientes: clientesSnap.size,
    totalPrestamosActivos: prestamosActivos,
    totalMorosos: morososSnap.size,
  };
  const current = {
    totalClientes: adminSnap.exists ? adminSnap.data()?.totalClientes ?? 0 : 0,
    totalPrestamosActivos: adminSnap.exists
      ? adminSnap.data()?.totalPrestamosActivos ?? 0
      : 0,
    totalMorosos: adminSnap.exists ? adminSnap.data()?.totalMorosos ?? 0 : 0,
  };
  console.log("  Contadores admin:", { current, expected });
  if (!dryRun) {
    await empresaRef.collection("usuarios").doc(adminId).set(expected, { merge: true });
    console.log("  Contadores admin reconciliados");
  }
  return { current, expected };
}

async function main() {
  console.log(
    dryRun
      ? "=== DELETE RUTA IXTLA (DRY-RUN) ==="
      : confirm
        ? "=== DELETE RUTA IXTLA (EJECUCIÓN REAL) ==="
        : "=== DELETE RUTA IXTLA (modo preview — usa CONFIRM=1 para ejecutar) ==="
  );
  console.log(`Código objetivo: ${codigo}\n`);

  const ruta = await discoverRuta();
  const { empresaId, rutaId, data: rd } = ruta;
  const adminId = typeof rd.adminId === "string" ? rd.adminId.trim() : "";
  if (!adminId) throw new Error("Ruta sin adminId");

  const empresaRef = db.collection(EMPRESAS).doc(empresaId);
  const capitalRuta = capitalRutaFromData(rd);
  const gananciasRuta = typeof rd.ganancias === "number" ? rd.ganancias : 0;

  const empleados = await resolveEmpleados(empresaRef, rutaId, rd);
  if (empleados.length > 1) {
    throw new Error(
      `Hay ${empleados.length} empleados en la ruta; abortando por seguridad. Revisar manualmente.`
    );
  }

  const [
    clientesCount,
    prestamosSnap,
    morososCount,
    pagosEstimado,
  ] = await Promise.all([
    countQuery(empresaRef.collection("clientes").where("rutaId", "==", rutaId)),
    empresaRef.collection("prestamos").where("rutaId", "==", rutaId).get(),
    countQuery(
      empresaRef
        .collection("clientes")
        .where("rutaId", "==", rutaId)
        .where("moroso", "==", true)
    ),
    (async () => {
      let n = 0;
      for (const p of (
        await empresaRef.collection("prestamos").where("rutaId", "==", rutaId).get()
      ).docs) {
        n += (await p.ref.collection("pagos").get()).size;
      }
      return n;
    })(),
  ]);

  const prestamosActivos = prestamosSnap.docs.filter((d) => isPrestamoEnCobro(d.data())).length;

  const before = await computeAdminSnapshot(empresaId, adminId);

  console.log("=== RUTA ENCONTRADA ===");
  console.log({
    empresaId,
    rutaId,
    codigo: rd.codigo,
    nombre: rd.nombre,
    adminId,
    cajaRuta: rd.cajaRuta ?? 0,
    cajasEmpleados: rd.cajasEmpleados ?? 0,
    inversiones: rd.inversiones ?? 0,
    capitalTotal: capitalRuta,
    ganancias: gananciasRuta,
  });

  console.log("\n=== EMPLEADO(S) ===");
  if (empleados.length === 0) console.log("  (ninguno asignado)");
  else empleados.forEach((e) => console.log(`  ${e.nombre} <${e.email}> uid=${e.uid}`));

  console.log("\n=== ENTIDADES A ELIMINAR ===");
  console.log({
    clientes: clientesCount,
    prestamos: prestamosSnap.size,
    prestamosActivos,
    morosos: morososCount,
    pagos: pagosEstimado,
    empleados: empleados.length,
  });

  console.log("\n=== IMPACTO ESPERADO EN DASHBOARD ===");
  console.log({
    rutasActivas: `${before.rutasCount} → ${before.rutasCount - 1}`,
    clientes: `${before.totalClientes} → ${before.totalClientes - clientesCount}`,
    prestamosActivos: `${before.totalPrestamosActivos} → ${before.totalPrestamosActivos - prestamosActivos}`,
    morosos: `${before.totalMorosos} → ${before.totalMorosos - morososCount}`,
    baseDeCapital: `${before.cajaAdmin} (sin cambio)`,
    capitalActual: `${before.capitalAdmin} → ${roundMoney(before.capitalAdmin - capitalRuta)}`,
    ganancias: `${before.gananciasTotales} → ${roundMoney(before.gananciasTotales - gananciasRuta)}`,
  });

  console.log("\n=== OTRAS RUTAS (no se tocan) ===");
  before.rutasDetalle
    .filter((r) => r.rutaId !== rutaId)
    .forEach((r) =>
      console.log(`  ${r.codigo} ${r.nombre}: capital=$${r.capital}, ganancias=$${r.ganancias}`)
    );

  if (dryRun || !confirm) {
    console.log(
      dryRun
        ? "\n[DRY-RUN] Finalizado. Nada fue modificado."
        : "\nEjecuta con CONFIRM=1 (sin --dry-run) para borrar de verdad."
    );
    return;
  }

  console.log("\n=== INICIANDO BORRADO ===");

  await deletePagosPrestamos(empresaRef, rutaId);
  await deleteQueryWhere(empresaRef, "prestamos", "rutaId", rutaId, "prestamos");
  await deleteQueryWhere(empresaRef, "clientes", "rutaId", rutaId, "clientes");
  for (const col of [
    "gastosAdministrador",
    "gastosEmpleado",
    "reportesDia",
    "solicitudesEntregaReporte",
    "solicitudesPrestamo",
  ]) {
    await deleteQueryWhere(empresaRef, col, "rutaId", rutaId, col);
  }
  for (const col of ["gastosEmpleado", "reportesDia", "solicitudesPrestamo"]) {
    for (const emp of empleados) {
      const snap = await empresaRef.collection(col).where("empleadoId", "==", emp.uid).get();
      if (!snap.empty) {
        await deleteDocsBatch(snap.docs.map((d) => d.ref), `${col}[empleadoId=${emp.uid}]`);
      }
      const snap2 = await empresaRef.collection(col).where("empleadoUid", "==", emp.uid).get();
      if (!snap2.empty) {
        await deleteDocsBatch(snap2.docs.map((d) => d.ref), `${col}[empleadoUid=${emp.uid}]`);
      }
    }
  }

  const movSnap = await empresaRef
    .collection("financialMovements")
    .where("rutaId", "==", rutaId)
    .get();
  await deleteDocsBatch(movSnap.docs.map((d) => d.ref), "financialMovements");

  await deleteDocsBatch(
    [
      empresaRef.collection("walletBalances").doc(`ruta_caja:${rutaId}`),
      empresaRef.collection("walletBalances").doc(`ruta_inversiones:${rutaId}`),
    ],
    "walletBalances ruta"
  );

  await deleteInversionesHistorialAdmin(empresaRef, adminId, rutaId);

  for (const emp of empleados) {
    await deleteEmpleado(empresaRef, emp);
  }

  const snapRef = empresaRef.collection("capital").doc("root").collection("rutas").doc(rutaId);
  if (!dryRun) await snapRef.delete().catch(() => {});
  else console.log("  [dry-run] eliminaría snapshot capital/root/rutas/" + rutaId);

  if (!dryRun) await ruta.ref.delete();
  else console.log("  [dry-run] eliminaría rutas/" + rutaId);
  console.log("  Documento de ruta eliminado");

  await persistAggregatedCapitalDocs(empresaId);
  await reconcileAdminCounters(empresaRef, adminId);

  const after = await computeAdminSnapshot(empresaId, adminId);

  console.log("\n=== VERIFICACIÓN AFTER ===");
  const deltaCapital = roundMoney(after.capitalAdmin - before.capitalAdmin);
  const deltaGanancias = roundMoney(after.gananciasTotales - before.gananciasTotales);
  const deltaCaja = roundMoney(after.cajaAdmin - before.cajaAdmin);

  console.log({
    capitalAdmin: { before: before.capitalAdmin, after: after.capitalAdmin, delta: deltaCapital },
    ganancias: {
      before: before.gananciasTotales,
      after: after.gananciasTotales,
      delta: deltaGanancias,
    },
    cajaAdmin: { before: before.cajaAdmin, after: after.cajaAdmin, delta: deltaCaja },
    rutas: { before: before.rutasCount, after: after.rutasCount },
  });

  const okCapital = Math.abs(deltaCapital + capitalRuta) < 0.02;
  const okGanancias = Math.abs(deltaGanancias + gananciasRuta) < 0.02;
  const okCaja = Math.abs(deltaCaja) < 0.02;
  const okRutas = after.rutasCount === before.rutasCount - 1;

  if (!okCapital || !okGanancias || !okCaja || !okRutas) {
    console.error("\n⚠️ VERIFICACIÓN CON ADVERTENCIAS — revisa manualmente el dashboard");
    if (!okCapital) console.error("  Capital actual no cuadra con lo esperado");
    if (!okGanancias) console.error("  Ganancias no cuadran");
    if (!okCaja) console.error("  cajaAdmin cambió (no debería)");
    if (!okRutas) console.error("  Conteo de rutas inesperado");
    process.exit(2);
  }

  console.log("\n✅ Eliminación completada y verificación OK.");
  console.log("Recarga el dashboard del admin para confirmar visualmente.");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
