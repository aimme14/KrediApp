/**
 * Suite de tests para firestore.rules.
 *
 * Requisitos:
 *   npm install --legacy-peer-deps   (instala @firebase/rules-unit-testing)
 *   JDK 21+ en PATH (firebase-tools emulador Firestore)
 *   npm run test:rules                (levanta emulador + corre este archivo)
 *
 * O manualmente:
 *   firebase emulators:start --only firestore &
 *   jest src/lib/__tests__/firestore-rules.test.ts --testEnvironment node
 *
 * Convenciones:
 *   assertSucceeds / assertFails de @firebase/rules-unit-testing
 *   Cada "usuario" tiene claims que reflejan AppAuthCustomClaims (sync-custom-claims.ts).
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

// ─── Configuración ────────────────────────────────────────────────────────────

const PROJECT_ID = "krediapp-rules-test";
const RULES_PATH = path.resolve(process.cwd(), "firestore.rules");

let testEnv: RulesTestEnvironment;

// ─── Helpers de tokens (reflejan AppAuthCustomClaims) ─────────────────────────

function tokenJefe(jefeUid: string) {
  return { role: "jefe", empresaId: jefeUid, enabled: true };
}

function tokenAdmin(jefeUid: string) {
  return { role: "admin", empresaId: jefeUid, enabled: true };
}

function tokenAdminEmpresa(adminEmpresaUid: string) {
  return { role: "adminEmpresa", empresaId: adminEmpresaUid, enabled: true };
}

function tokenEmpleado(jefeUid: string, rutaId: string, adminId: string) {
  return { role: "empleado", empresaId: jefeUid, enabled: true, rutaId, adminId };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8081,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

afterEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

// ─── Datos de fixtures ────────────────────────────────────────────────────────

const JEFE_A  = "jefe-a";
const JEFE_B  = "jefe-b";
const ADMIN_A1    = "admin-a1";
const ADMIN_A2    = "admin-a2";
const EMPLEADO_A1 = "empleado-a1";
const RUTA_A1 = "ruta-a1";
const RUTA_A2 = "ruta-a2";

async function seedFixtures() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Empresa A
    await setDoc(doc(db, "empresas", JEFE_A), { nombre: "Empresa A", activa: true });

    // Clientes
    await setDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a1"), {
      nombre: "Cliente A1", adminId: ADMIN_A1, rutaId: RUTA_A1, empresaId: JEFE_A,
    });
    await setDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a2"), {
      nombre: "Cliente A2", adminId: ADMIN_A2, rutaId: RUTA_A2, empresaId: JEFE_A,
    });

    // Préstamos activos
    await setDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1"), {
      adminId: ADMIN_A1, rutaId: RUTA_A1, estado: "activo", empresaId: JEFE_A,
    });
    await setDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a2"), {
      adminId: ADMIN_A2, rutaId: RUTA_A2, estado: "activo", empresaId: JEFE_A,
    });

    // Préstamos castigado/pagado de A1
    await setDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1-castigado"), {
      adminId: ADMIN_A1, rutaId: RUTA_A1, estado: "castigado", empresaId: JEFE_A,
    });
    await setDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1-pagado"), {
      adminId: ADMIN_A1, rutaId: RUTA_A1, estado: "pagado", empresaId: JEFE_A,
    });

    // Pagos
    await setDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1", "pagos", "pago-1"), {
      adminId: ADMIN_A1, empleadoId: EMPLEADO_A1, empresaId: JEFE_A, monto: 50000,
    });

    // Rutas
    await setDoc(doc(db, "empresas", JEFE_A, "rutas", RUTA_A1), {
      adminId: ADMIN_A1, nombre: "Ruta A1",
    });
    await setDoc(doc(db, "empresas", JEFE_A, "rutas", RUTA_A2), {
      adminId: ADMIN_A2, nombre: "Ruta A2",
    });

    // Usuarios
    await setDoc(doc(db, "empresas", JEFE_A, "usuarios", ADMIN_A1), {
      rol: "admin", adminId: ADMIN_A1, nombre: "Admin A1",
    });
    await setDoc(doc(db, "empresas", JEFE_A, "usuarios", ADMIN_A2), {
      rol: "admin", adminId: ADMIN_A2, nombre: "Admin A2",
    });
    await setDoc(doc(db, "empresas", JEFE_A, "usuarios", EMPLEADO_A1), {
      rol: "empleado", adminId: ADMIN_A1, rutaId: RUTA_A1, nombre: "Empleado A1",
    });

    // Empresa B (empresa ajena)
    await setDoc(doc(db, "empresas", JEFE_B), { nombre: "Empresa B", activa: true });
    await setDoc(doc(db, "empresas", JEFE_B, "clientes", "cliente-b1"), {
      nombre: "Cliente B1", adminId: "admin-b1", rutaId: "ruta-b1", empresaId: JEFE_B,
    });
    await setDoc(doc(db, "empresas", JEFE_B, "prestamos", "prestamo-b1"), {
      adminId: "admin-b1", rutaId: "ruta-b1", estado: "activo", empresaId: JEFE_B,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WRITES — siempre bloqueados
// ═══════════════════════════════════════════════════════════════════════════════

describe("writes — always denied", () => {
  test("admin no puede escribir cliente", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(
      setDoc(doc(db, "empresas", JEFE_A, "clientes", "nuevo"), { nombre: "X" })
    );
  });

  test("empleado no puede escribir préstamo", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(EMPLEADO_A1, tokenEmpleado(JEFE_A, RUTA_A1, ADMIN_A1)).firestore();
    await assertFails(
      setDoc(doc(db, "empresas", JEFE_A, "prestamos", "nuevo"), { adminId: ADMIN_A1 })
    );
  });

  test("admin no puede escribir pago", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(
      setDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1", "pagos", "nuevo"), { monto: 1 })
    );
  });

  test("usuario no autenticado no puede leer ni escribir", async () => {
    await seedFixtures();
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a1")));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CROSS-COMPANY — lectura de empresa ajena debe ser denegada
// ═══════════════════════════════════════════════════════════════════════════════

describe("cross-company reads — denied", () => {
  test("admin A no puede leer doc raíz de empresa B", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_B)));
  });

  test("admin A no puede leer cliente de empresa B", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_B, "clientes", "cliente-b1")));
  });

  test("admin A no puede leer préstamo de empresa B", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_B, "prestamos", "prestamo-b1")));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FUGA LATERAL — admin A1 no puede leer datos de admin A2 (misma empresa)
// ═══════════════════════════════════════════════════════════════════════════════

describe("lateral leak — admin A1 vs admin A2 (same company)", () => {
  test("admin A1 no puede leer cliente de admin A2", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a2")));
  });

  test("admin A1 no puede leer préstamo de admin A2", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a2")));
  });

  test("empleado A1 no puede leer préstamo de ruta A2", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(EMPLEADO_A1, tokenEmpleado(JEFE_A, RUTA_A1, ADMIN_A1)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a2")));
  });

  test("admin A1 no puede leer doc de usuario de admin A2", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_A, "usuarios", ADMIN_A2)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PAGOS — scope correcto (sin override del matcher anidado)
// ═══════════════════════════════════════════════════════════════════════════════

describe("pagos — scope", () => {
  test("admin A2 no puede leer pago de préstamo de admin A1", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A2, tokenAdmin(JEFE_A)).firestore();
    await assertFails(
      getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1", "pagos", "pago-1"))
    );
  });

  test("admin A1 puede leer su propio pago", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(
      getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1", "pagos", "pago-1"))
    );
  });

  test("empleado A1 puede leer pago donde es empleadoId", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(EMPLEADO_A1, tokenEmpleado(JEFE_A, RUTA_A1, ADMIN_A1)).firestore();
    await assertSucceeds(
      getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1", "pagos", "pago-1"))
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. READS LEGÍTIMOS — permitidos con reglas endurecidas
// ═══════════════════════════════════════════════════════════════════════════════

describe("reads legítimos — siempre permitidos", () => {
  test("admin A1 lee su propio cliente", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a1")));
  });

  test("admin A1 lee su propio préstamo activo", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1")));
  });

  test("admin A1 lee su propio préstamo castigado", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1-castigado")));
  });

  test("admin A1 lee su propio préstamo pagado", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1-pagado")));
  });

  test("empleado A1 lee préstamo de su ruta", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(EMPLEADO_A1, tokenEmpleado(JEFE_A, RUTA_A1, ADMIN_A1)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "prestamos", "prestamo-a1")));
  });

  test("empleado A1 lee cliente de su ruta", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(EMPLEADO_A1, tokenEmpleado(JEFE_A, RUTA_A1, ADMIN_A1)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a1")));
  });

  test("admin A1 lee su propia ruta", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "rutas", RUTA_A1)));
  });

  test("admin A1 lee su propio doc de usuario", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "usuarios", ADMIN_A1)));
  });

  test("jefe A lee doc raíz de su empresa", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(JEFE_A, tokenJefe(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A)));
  });

  test("jefe A lee cliente de admin A1", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(JEFE_A, tokenJefe(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a1")));
  });

  // Control positivo: jefe ve cliente que pertenece a otro admin — debe poder verlo
  test("jefe A lee cliente de admin A2 (control positivo de rol jefe)", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(JEFE_A, tokenJefe(JEFE_A)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", JEFE_A, "clientes", "cliente-a2")));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. QUERY COMPATIBILIDAD — queries del cliente vs reglas endurecidas
// ═══════════════════════════════════════════════════════════════════════════════

describe("query compatibility — queries del cliente", () => {
  // TrabajadorListaContext — clientes
  test("admin: clientes where adminId == uid", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "clientes"),
        where("adminId", "==", ADMIN_A1)
      ))
    );
  });

  test("empleado: clientes where rutaId == token.rutaId", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(EMPLEADO_A1, tokenEmpleado(JEFE_A, RUTA_A1, ADMIN_A1)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "clientes"),
        where("rutaId", "==", RUTA_A1)
      ))
    );
  });

  // TrabajadorListaContext — préstamos activos
  test("admin: préstamos where adminId == uid AND estado == activo", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "prestamos"),
        where("adminId", "==", ADMIN_A1),
        where("estado", "==", "activo")
      ))
    );
  });

  // TrabajadorListaContext — préstamos castigados
  test("admin: préstamos where adminId == uid AND estado == castigado", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "prestamos"),
        where("adminId", "==", ADMIN_A1),
        where("estado", "==", "castigado")
      ))
    );
  });

  // TrabajadorListaContext — préstamos pagados (getDocs, lazy)
  test("admin: préstamos where adminId == uid AND estado == pagado", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "prestamos"),
        where("adminId", "==", ADMIN_A1),
        where("estado", "==", "pagado")
      ))
    );
  });

  // TrabajadorListaContext — préstamos de empleado por ruta + estado
  test("empleado: préstamos where rutaId == token.rutaId AND estado == activo", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(EMPLEADO_A1, tokenEmpleado(JEFE_A, RUTA_A1, ADMIN_A1)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "prestamos"),
        where("rutaId", "==", RUTA_A1),
        where("estado", "==", "activo")
      ))
    );
  });

  // AdminDashboardContext — rutas por adminId
  test("admin: rutas where adminId == uid", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "rutas"),
        where("adminId", "==", ADMIN_A1)
      ))
    );
  });

  // AdminDashboardContext — usuarios (empleados de un admin)
  test("admin: usuarios where adminId == uid", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(ADMIN_A1, tokenAdmin(JEFE_A)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "usuarios"),
        where("adminId", "==", ADMIN_A1)
      ))
    );
  });

  // Jefe — todos los clientes de la empresa (sin filtro adminId)
  test("jefe: clientes where empresaId == jefeUid (sin filtro adminId)", async () => {
    await seedFixtures();
    const db = testEnv.authenticatedContext(JEFE_A, tokenJefe(JEFE_A)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", JEFE_A, "clientes"),
        where("empresaId", "==", JEFE_A)
      ))
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ADMIN EMPRESA — empresa propia (empresaId == uid)
// ═══════════════════════════════════════════════════════════════════════════════

const ADMIN_E = "admin-empresa-e";
const RUTA_E1 = "ruta-e1";

async function seedAdminEmpresaFixtures() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "empresas", ADMIN_E), { nombre: "Empresa propia", activa: true, tipoEmpresa: "adminEmpresa" });
    await setDoc(doc(db, "empresas", ADMIN_E, "usuarios", ADMIN_E), {
      rol: "adminEmpresa",
      nombre: "Admin Empresa",
      cajaAdmin: 10_000_000,
    });
    await setDoc(doc(db, "empresas", ADMIN_E, "rutas", RUTA_E1), {
      adminId: ADMIN_E,
      nombre: "Ruta E1",
    });
    await setDoc(doc(db, "empresas", ADMIN_E, "clientes", "cliente-e1"), {
      nombre: "Cliente E1",
      adminId: ADMIN_E,
      rutaId: RUTA_E1,
      empresaId: ADMIN_E,
    });
  });
}

describe("adminEmpresa — empresa propia", () => {
  test("adminEmpresa lee doc raíz de su empresa", async () => {
    await seedAdminEmpresaFixtures();
    const db = testEnv.authenticatedContext(ADMIN_E, tokenAdminEmpresa(ADMIN_E)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", ADMIN_E)));
  });

  test("adminEmpresa: rutas where adminId == uid", async () => {
    await seedAdminEmpresaFixtures();
    const db = testEnv.authenticatedContext(ADMIN_E, tokenAdminEmpresa(ADMIN_E)).firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "empresas", ADMIN_E, "rutas"),
        where("adminId", "==", ADMIN_E)
      ))
    );
  });

  test("adminEmpresa lee su propio cliente", async () => {
    await seedAdminEmpresaFixtures();
    const db = testEnv.authenticatedContext(ADMIN_E, tokenAdminEmpresa(ADMIN_E)).firestore();
    await assertSucceeds(getDoc(doc(db, "empresas", ADMIN_E, "clientes", "cliente-e1")));
  });

  test("adminEmpresa no lee empresa de un jefe ajeno", async () => {
    await seedFixtures();
    await seedAdminEmpresaFixtures();
    const db = testEnv.authenticatedContext(ADMIN_E, tokenAdminEmpresa(ADMIN_E)).firestore();
    await assertFails(getDoc(doc(db, "empresas", JEFE_A)));
  });
});
