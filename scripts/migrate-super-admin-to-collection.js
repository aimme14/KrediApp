/**
 * Script de migración: mueve Super Admins de /users a /superAdmin
 *
 * Uso (en la raíz del proyecto):
 *   npm run migrate-super-admin
 *
 * Opciones (variables de entorno):
 *   DRY_RUN=1     Solo muestra lo que haría, sin escribir en Firestore
 *   DELETE_AFTER=1  Elimina el documento de users después de migrar (por defecto: sí)
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
const deleteAfter = process.env.DELETE_AFTER !== "0";

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

  (async () => {
    try {
      console.log("\n🔄 Migrando Super Admins de /users a /superAdmin...\n");
      if (dryRun) console.log("   (Modo DRY_RUN: no se escribirá nada)\n");

      const snapshot = await db
        .collection("users")
        .where("role", "==", "superAdmin")
        .get();

      if (snapshot.empty) {
        console.log("   No se encontraron Super Admins en la colección 'users'.");
        console.log("   Nada que migrar.\n");
        process.exit(0);
      }

      for (const docSnap of snapshot.docs) {
        const uid = docSnap.id;
        const data = docSnap.data();

        const superAdminData = {
          uid,
          email: data.email ?? "",
          displayName: data.displayName ?? null,
          role: "superAdmin",
          enabled: data.enabled !== false,
          createdBy: data.createdBy ?? "",
          createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          emailVerified: data.emailVerified !== false,
        };

        console.log(`   Migrando: ${data.email} (${uid})`);

        if (!dryRun) {
          await db.collection("superAdmin").doc(uid).set(superAdminData);
          if (deleteAfter) {
            await db.collection("users").doc(uid).delete();
            console.log(`      ✅ Migrado y eliminado de users`);
          } else {
            console.log(`      ✅ Migrado a superAdmin`);
          }
        }
      }

      console.log(`\n✅ Migración completada. ${snapshot.size} Super Admin(s) procesado(s).\n`);
    } catch (err) {
      console.error("\n❌ Error:", err.message);
      if (err.code) console.error("   Código:", err.code);
      process.exit(1);
    }
  })();
}

main();
