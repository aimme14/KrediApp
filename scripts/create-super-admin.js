/**
 * Script de un solo uso: crea el primer usuario Super Admin en Firebase.
 * Uso (en la raíz del proyecto):
 *
 *   Windows (PowerShell):
 *     $env:SETUP_EMAIL="tu@email.com"; $env:SETUP_PASSWORD="TuContraseñaSegura"; npm run create-super-admin
 *
 *   Windows (CMD):
 *     set SETUP_EMAIL=tu@email.com
 *     set SETUP_PASSWORD=TuContraseñaSegura
 *     npm run create-super-admin
 *
 *   Linux/macOS:
 *     SETUP_EMAIL=tu@email.com SETUP_PASSWORD=TuContraseñaSegura npm run create-super-admin
 *
 * Requiere tener .env.local con las variables de Firebase (cliente y Admin).
 */

const path = require("path");
const fs = require("fs");

// Cargar .env desde la raíz del proyecto (varias ubicaciones por si npm cambia el cwd)
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
const email = (process.env.SETUP_EMAIL || "").trim();
const password = process.env.SETUP_PASSWORD;

function main() {
  if (!email || !password) {
    console.error(
      "\n❌ Faltan SETUP_EMAIL o SETUP_PASSWORD.\n" +
        "   Ejemplo en PowerShell:\n" +
        '   $env:SETUP_EMAIL="super@tudominio.com"; $env:SETUP_PASSWORD="TuClave123"; npm run create-super-admin\n'
    );
    process.exit(1);
  }

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "\n❌ Faltan variables de Firebase Admin. Asegúrate de tener en .env o .env.local:\n" +
        "   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n" +
        "   (Revisa que no haya espacios después del = y que el archivo esté en la raíz del proyecto.)\n"
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

  const auth = admin.auth();
  const db = admin.firestore();

  (async () => {
    try {
      const userRecord = await auth.createUser({
        email,
        password,
        emailVerified: true,
      });
      const uid = userRecord.uid;

      const now = admin.firestore.FieldValue.serverTimestamp();
      await db.collection("superAdmin").doc(uid).set({
        uid,
        email,
        role: "superAdmin",
        enabled: true,
        createdBy: "",
        createdAt: now,
        updatedAt: now,
        emailVerified: true,
      });

      console.log("\n✅ Super Admin creado correctamente.\n");
      console.log("   UID:    ", uid);
      console.log("   Email:  ", email);
      console.log("   Rol:    superAdmin\n");
      console.log("   Ya puedes iniciar sesión en la app con ese correo y contraseña.\n");
    } catch (err) {
      const msg = err.message || String(err);
      if (err.code === "auth/email-already-exists") {
        console.error("\n❌ Ese correo ya está registrado en Firebase Auth.");
        console.error("   Crea el documento en Firestore: colección 'superAdmin', id = UID del usuario, con role: 'superAdmin', enabled: true, emailVerified: true.\n");
      } else if (msg.includes("no configuration") || msg.includes("provided identifier")) {
        console.error("\n❌ Firebase no reconoce la configuración. Comprueba:\n");
        console.error("   1. Firebase Console > Authentication > Sign-in method: activa 'Correo/contraseña'.\n");
        console.error("   2. La cuenta de servicio: Firebase Console > Configuración del proyecto > Cuentas de servicio >");
        console.error("      'Generar nueva clave privada'. En el JSON usa 'project_id', 'client_email' y 'private_key' en tu .env.\n");
        console.error("   3. FIREBASE_CLIENT_EMAIL debe ser algo como: firebase-adminsdk-XXXXX@krediapp-b9d26.iam.gserviceaccount.com\n");
      } else {
        console.error("\n❌ Error:", msg);
        if (err.code) console.error("   Código:", err.code);
      }
      process.exit(1);
    }
  })();
}

main();
