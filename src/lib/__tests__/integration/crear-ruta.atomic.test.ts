/**
 * Creación de ruta con capital inicial.
 *
 * Antes del fix eran tres operaciones sueltas (descontar cajaAdmin, avanzar el
 * contador, escribir la ruta). Un fallo intermedio dejaba la caja descontada
 * sin ruta creada, o el contador avanzado sin nada que lo justifique.
 */

import type { NextRequest } from "next/server";
import type { ApiUser } from "@/lib/api-auth";
import {
  db,
  empresaRef,
  leerUsuario,
  limpiarEmpresa,
  nuevaEmpresaId,
  num,
  RUTAS,
  seedAdmin,
} from "./helpers";

const empresaId = nuevaEmpresaId("crear-ruta");
const adminUid = "admin-1";

const usuarioActual: ApiUser = { uid: adminUid, empresaId, role: "admin" };

jest.mock("@/lib/api-auth", () => ({
  getApiUser: jest.fn(async () => usuarioActual),
}));

jest.mock("@/lib/firebase-admin", () => ({
  getAdminFirestore: () => require("./helpers").db,
  getAdminMessaging: () => ({ send: async () => undefined }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { POST } = require("@/app/api/empresa/rutas/route") as {
  POST: (req: NextRequest) => Promise<Response>;
};

function crearRuta(body: Record<string, unknown>) {
  return POST({
    json: async () => body,
    headers: new Headers(),
  } as unknown as NextRequest);
}

describe("Creación de ruta — atomicidad", () => {
  beforeEach(async () => {
    await seedAdmin({ empresaId, adminUid, cajaAdmin: 300_000 });
    await db.collection("users").doc(adminUid).set({ adminNum: 1, codigo: "AD-001" });

    const rutas = await empresaRef(empresaId).collection(RUTAS).get();
    await Promise.all(rutas.docs.map((d) => d.ref.delete()));
    await db.collection("counters").doc(`rutas_${adminUid}`).delete().catch(() => undefined);
  });

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
    await db.collection("users").doc(adminUid).delete().catch(() => undefined);
    await db.collection("counters").doc(`rutas_${adminUid}`).delete().catch(() => undefined);
  });

  it("descuenta la caja y crea la ruta con el capital inicial", async () => {
    const respuesta = await crearRuta({ nombre: "Ruta Centro", capitalInicial: 100_000 });
    expect(respuesta.status).toBe(200);

    const { id } = await respuesta.json();
    const ruta = await empresaRef(empresaId).collection(RUTAS).doc(id).get();

    expect(ruta.exists).toBe(true);
    expect(num(ruta.data()?.cajaRuta)).toBe(100_000);
    expect(num(ruta.data()?.capitalTotal)).toBe(100_000);
    expect(ruta.data()?.codigo).toBe("RT-001-001");

    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(admin.cajaAdmin)).toBe(200_000);
  });

  it("sin saldo suficiente no crea la ruta ni descuenta ni avanza el contador", async () => {
    const respuesta = await crearRuta({ nombre: "Ruta Cara", capitalInicial: 900_000 });
    expect(respuesta.status).toBe(400);

    const rutas = await empresaRef(empresaId).collection(RUTAS).get();
    expect(rutas.size).toBe(0);

    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(admin.cajaAdmin)).toBe(300_000);

    const counter = await db.collection("counters").doc(`rutas_${adminUid}`).get();
    expect(counter.exists).toBe(false);
  });

  it("creaciones concurrentes asignan códigos distintos y descuentan una vez cada una", async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        crearRuta({ nombre: `Ruta ${i}`, capitalInicial: 50_000 })
      )
    );

    const exitosas = respuestas.filter((r) => r.status === 200).length;
    expect(exitosas).toBe(3);

    const rutas = await empresaRef(empresaId).collection(RUTAS).get();
    expect(rutas.size).toBe(3);

    const codigos = new Set(rutas.docs.map((d) => d.data().codigo));
    expect(codigos.size).toBe(3);

    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(admin.cajaAdmin)).toBe(150_000);
  });

  it("con capital inicial cero crea la ruta sin tocar la caja", async () => {
    const respuesta = await crearRuta({ nombre: "Ruta Vacía", capitalInicial: 0 });
    expect(respuesta.status).toBe(200);

    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(admin.cajaAdmin)).toBe(300_000);

    const rutas = await empresaRef(empresaId).collection(RUTAS).get();
    expect(rutas.size).toBe(1);
    expect(num(rutas.docs[0].data().cajaRuta)).toBe(0);
  });

  it("el total de capital en rutas más la caja del admin se conserva", async () => {
    await Promise.all([
      crearRuta({ nombre: "R1", capitalInicial: 70_000 }),
      crearRuta({ nombre: "R2", capitalInicial: 80_000 }),
      crearRuta({ nombre: "R3", capitalInicial: 400_000 }), // no alcanza
    ]);

    const rutas = await empresaRef(empresaId).collection(RUTAS).get();
    const capitalEnRutas = rutas.docs.reduce((s, d) => s + num(d.data().cajaRuta), 0);
    const admin = await leerUsuario(empresaId, adminUid);

    expect(capitalEnRutas + num(admin.cajaAdmin)).toBe(300_000);
  });
});
