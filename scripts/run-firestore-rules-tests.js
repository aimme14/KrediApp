/**
 * Ejecuta la suite de reglas Firestore con el emulador.
 * Cross-platform (Windows PowerShell / bash).
 *
 * Requisitos: JDK 21+ (firebase-tools), @firebase/rules-unit-testing.
 */
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/** Puerto Firestore del emulador (firebase.json). */
function getFirestoreEmulatorPort() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "firebase.json"), "utf8"));
    return Number(cfg?.emulators?.firestore?.port) || 8081;
  } catch {
    return 8081;
  }
}

/**
 * Libera el puerto del emulador si un Java/firebase anterior quedó colgado
 * (común en Windows tras Ctrl+C o un run interrumpido).
 */
function freeEmulatorPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
          console.log(`Puerto ${port} liberado (proceso ${pid} detenido).`);
        } catch {
          // ya no existe o sin permiso
        }
      }
    } else {
      try {
        execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
        console.log(`Puerto ${port} liberado.`);
      } catch {
        // nada escuchando
      }
    }
  } catch {
    // puerto libre
  }
}

function refreshPathEnv() {
  if (process.platform !== "win32") return process.env;

  const parts = [
    process.env.Path,
    process.env.PATH,
    process.env.Path?.split(";") ?? [],
    process.env.PATH?.split(";") ?? [],
    process.env["ProgramFiles"] ? path.join(process.env["ProgramFiles"], "Eclipse Adoptium") : null,
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Eclipse Adoptium") : null,
  ]
    .flat()
    .filter(Boolean);

  // Añadir .../jdk-*/bin de Eclipse Adoptium si existen (post-instalación sin reiniciar terminal).
  const adoptiumRoots = [
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Eclipse Adoptium"),
  ];
  for (const root of adoptiumRoots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith("jdk-")) {
          parts.push(path.join(root, entry.name, "bin"));
        }
      }
    } catch {
      // ignorar si no existe
    }
  }

  try {
    const machine = execSync(
      'powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\') + \';\' + [Environment]::GetEnvironmentVariable(\'Path\',\'User\')"',
      {
        encoding: "utf8",
      }
    ).trim();
    if (machine) parts.unshift(machine);
  } catch {
    // fallback silencioso
  }

  const merged = [...new Set(parts.flatMap((p) => (typeof p === "string" ? p.split(";") : p)).filter(Boolean))];
  return { ...process.env, Path: merged.join(";"), PATH: merged.join(";") };
}

function assertJavaAvailable(env) {
  const check = spawnSync("java", ["-version"], { env, shell: true, encoding: "utf8" });
  if (check.status === 0 || check.stderr?.includes("version")) return;

  console.error(`
Error: Java no está en el PATH de esta terminal.

Firebase Emulator requiere JDK 21 o superior.

Solución rápida:
  1. Cierra esta terminal y abre una nueva.
  2. Verifica: java -version
  3. Vuelve a correr: npm run test:rules

Si no tienes Java, instala Temurin 21:
  winget install EclipseAdoptium.Temurin.21.JDK --source winget
`);
  process.exit(1);
}

const env = refreshPathEnv();
assertJavaAvailable(env);

const firestorePort = getFirestoreEmulatorPort();
freeEmulatorPort(firestorePort);

const jestCommand =
  "npx jest src/lib/__tests__/firestore-rules.test.ts --testEnvironment node --no-coverage --testPathIgnorePatterns=[]";

const fullCommand = `npx firebase-tools emulators:exec --only firestore "${jestCommand}"`;

const result = spawnSync(fullCommand, {
  stdio: "inherit",
  shell: true,
  env,
});

process.exit(result.status === null ? 1 : result.status);
