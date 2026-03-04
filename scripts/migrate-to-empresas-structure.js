/**
 * Migración: estructura antigua -> nueva estructura bajo /empresas
 *
 * Estructura antigua:
 *   /users/{uid} - jefes, admins, trabajadores
 *   /empresas/{jefeUid} - datos de empresa
 *
 * Estructura nueva:
 *   /empresas/{empresaId}
 *     - nombre, logo, dueño, sedePrincipal, fechaCreacion, activa, dueñoUid
 *     - /usuarios/{usuarioId}
 *     - /rutas, /clientes, /prestamos, /gastos (subcolecciones vacías)
 *   /users/{uid} - índice de auth con empresaId
 *
 * Uso:
 *   npm run migrate-empresas
 *   DRY_RUN=1 npm run migrate-empresas   # Solo simular
 *
 * Requiere .env.local con FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const envPaths = [
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
  path.join(root, ".env.local"),
  path.join(root, ".env"),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require("dotenv").config({ path: p });
  }
}

const admin = require("firebase-admin");

const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
const rawKey = process.env.FIREBASE_PRIVATE_KEY || "";
const privateKey = rawKey.replace(/\\n/g, "\n").trim();
const dryRun = process.env.DRY_RUN === "1";

function main() {
  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "\n❌ Faltan variables de Firebase Admin en .env o .env.local:\n" +
        "   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n"
    );
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  (async () => {
    try {
      console.log("\n🔄 Migrando a nueva estructura /empresas...\n");
      if (dryRun) console.log("   (Modo DRY_RUN: no se escribirá nada)\n");

      const usersSnap = await db.collection("users").get();
      const empresasSnap = await db.collection("empresas").get();

      const usersById = {};
      usersSnap.docs.forEach((d) => {
        usersById[d.id] = { id: d.id, ...d.data() };
      });

      const empresasById = {};
      empresasSnap.docs.forEach((d) => {
        empresasById[d.id] = d.data();
      });

      // 1. Jefes: crear/actualizar empresas, crear usuarios subcollection
      const jefes = usersSnap.docs
        .filter((d) => d.data().role === "jefe")
        .map((d) => ({ id: d.id, ...d.data() }));

      for (const jefe of jefes) {
        const empresaId = jefe.id;
        const empData = empresasById[empresaId] || {};

        const empresaDoc = {
          nombre: empData.nombre ?? "",
          logo: empData.logo ?? "",
          dueño: empData.dueño ?? jefe.displayName ?? "",
          sedePrincipal: empData.sedePrincipal ?? "",
          fechaCreacion: empData.fechaCreacion || now,
          activa: empData.activa !== false,
          dueñoUid: jefe.id,
        };

        const usuarioDoc = {
          nombre: jefe.displayName ?? "",
          email: jefe.email ?? "",
          rol: "jefe",
          activo: jefe.enabled !== false,
          creadoPor: jefe.createdBy ?? "",
          fechaCreacion: jefe.createdAt || now,
        };

        console.log(`   Jefe: ${jefe.email} (${jefe.id})`);
        if (!dryRun) {
          await db.collection("empresas").doc(empresaId).set(empresaDoc, { merge: true });
          await db
            .collection("empresas")
            .doc(empresaId)
            .collection("usuarios")
            .doc(jefe.id)
            .set(usuarioDoc);
          await db.collection("users").doc(jefe.id).set(
            {
              empresaId,
              role: "jefe",
              email: jefe.email,
              displayName: jefe.displayName,
              enabled: jefe.enabled !== false,
              createdBy: jefe.createdBy ?? "",
              createdAt: jefe.createdAt,
              updatedAt: now,
            },
            { merge: true }
          );
        }
        console.log(`      ✅ Empresa y usuario migrados`);
      }

      // 2. Admins: empresaId = createdBy (jefe)
      const admins = usersSnap.docs
        .filter((d) => d.data().role === "admin")
        .map((d) => ({ id: d.id, ...d.data() }));

      for (const adminUser of admins) {
        const empresaId = adminUser.createdBy;
        if (!empresaId) {
          console.log(`   ⚠ Admin ${adminUser.email} sin createdBy, omitiendo`);
          continue;
        }

        const usuarioDoc = {
          nombre: adminUser.displayName ?? "",
          email: adminUser.email ?? "",
          rol: "admin",
          activo: adminUser.enabled !== false,
          creadoPor: adminUser.createdBy ?? "",
          cedula: adminUser.cedula,
          lugar: adminUser.lugar,
          base: adminUser.base,
          fechaCreacion: adminUser.createdAt || now,
        };

        console.log(`   Admin: ${adminUser.email} -> empresa ${empresaId}`);
        if (!dryRun) {
          await db
            .collection("empresas")
            .doc(empresaId)
            .collection("usuarios")
            .doc(adminUser.id)
            .set(usuarioDoc);
          await db.collection("users").doc(adminUser.id).set(
            {
              empresaId,
              role: "admin",
              email: adminUser.email,
              displayName: adminUser.displayName,
              enabled: adminUser.enabled !== false,
              createdBy: adminUser.createdBy ?? "",
              cedula: adminUser.cedula,
              lugar: adminUser.lugar,
              base: adminUser.base,
              updatedAt: now,
            },
            { merge: true }
          );
        }
        console.log(`      ✅ Admin migrado`);
      }

      // 3. Trabajadores/empleados: empresaId del admin creador
      const trabajadores = usersSnap.docs
        .filter((d) => {
          const r = d.data().role;
          return r === "trabajador" || r === "empleado";
        })
        .map((d) => ({ id: d.id, ...d.data() }));

      for (const trab of trabajadores) {
        const creador = usersById[trab.createdBy];
        // Empleado creado por admin -> empresaId = jefe (admin.createdBy)
        const empresaId = creador?.empresaId || creador?.createdBy || creador?.id;
        if (!empresaId) {
          console.log(`   ⚠ Empleado ${trab.email} sin empresaId del creador, omitiendo`);
          continue;
        }

        const usuarioDoc = {
          nombre: trab.displayName ?? "",
          email: trab.email ?? "",
          rol: "empleado",
          activo: trab.enabled !== false,
          creadoPor: trab.createdBy ?? "",
          adminId: trab.adminId,
          cedula: trab.cedula,
          lugar: trab.lugar,
          base: trab.base,
          fechaCreacion: trab.createdAt || now,
        };

        console.log(`   Empleado: ${trab.email} -> empresa ${empresaId}`);
        if (!dryRun) {
          await db
            .collection("empresas")
            .doc(empresaId)
            .collection("usuarios")
            .doc(trab.id)
            .set(usuarioDoc);
          await db.collection("users").doc(trab.id).set(
            {
              empresaId,
              role: "empleado",
              email: trab.email,
              displayName: trab.displayName,
              enabled: trab.enabled !== false,
              createdBy: trab.createdBy ?? "",
              adminId: trab.adminId,
              cedula: trab.cedula,
              lugar: trab.lugar,
              base: trab.base,
              updatedAt: now,
            },
            { merge: true }
          );
        }
        console.log(`      ✅ Empleado migrado`);
      }

      console.log(`\n✅ Migración completada.`);
      console.log(`   Jefes: ${jefes.length}, Admins: ${admins.length}, Empleados: ${trabajadores.length}\n`);
    } catch (err) {
      console.error("\n❌ Error:", err.message);
      if (err.code) console.error("   Código:", err.code);
      process.exit(1);
    }
  })();
}

main();
