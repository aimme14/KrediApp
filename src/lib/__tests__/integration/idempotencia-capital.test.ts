/**
 * Idempotencia de los endpoints que mueven capital.
 *
 * Escenario que motiva estos tests: la petición llega al servidor y se ejecuta,
 * pero la respuesta se pierde por un corte de red. El usuario ve un error,
 * cree que no pasó nada y lo repite. Sin clave de idempotencia el dinero se
 * mueve dos veces; en los dos endpoints que inyectan liquidez externa
 * (`ingresar-base` y `jefe/invertir`) eso además crea dinero que no existe.
 *
 * Cada endpoint se prueba en dos direcciones:
 *  - misma clave  → se aplica una sola vez (no duplica)
 *  - claves distintas → se aplica las dos veces (no bloquea operaciones reales)
 */

import type { NextRequest } from "next/server";
import type { ApiUser } from "@/lib/api-auth";
import {
  db,
  empresaRef,
  leerCajaEmpresa,
  leerRuta,
  leerUsuario,
  limpiarEmpresa,
  nuevaEmpresaId,
  num,
  RUTAS,
  seedAdmin,
  seedCajaEmpresa,
  seedRuta,
  USUARIOS,
} from "./helpers";

/** El jefe identifica su empresa con su propio uid. */
const empresaId = nuevaEmpresaId("idem-cap");
const jefeUid = empresaId;
const adminUid = "admin-1";
const adminEmpresaUid = "admin-empresa-1";
const rutaId = "ruta-1";

let usuarioActual: ApiUser = { uid: adminUid, empresaId, role: "admin" };

jest.mock("@/lib/api-auth", () => ({
  getApiUser: jest.fn(async () => usuarioActual),
}));

jest.mock("@/lib/firebase-admin", () => ({
  getAdminFirestore: () => require("./helpers").db,
  getAdminMessaging: () => ({ send: async () => undefined }),
}));

type Handler = (req: NextRequest) => Promise<Response>;

/* eslint-disable @typescript-eslint/no-var-requires */
const postIngresarBase = require("@/app/api/admin-empresa/ingresar-base/route")
  .POST as Handler;
const postJefeInvertir = require("@/app/api/jefe/invertir/route").POST as Handler;
const postTransferir = require("@/app/api/jefe/transferir-base-admin/route")
  .POST as Handler;
const postACajaAdmin = require("@/app/api/empresa/invertir-caja-admin/route")
  .POST as Handler;
const postACajaRuta = require("@/app/api/empresa/invertir-caja-ruta/route")
  .POST as Handler;
/* eslint-enable @typescript-eslint/no-var-requires */

function pedir(handler: Handler, body: Record<string, unknown>) {
  return handler({
    json: async () => body,
    headers: new Headers(),
  } as unknown as NextRequest);
}

/** Simula el reintento del usuario: dos envíos con la misma clave. */
async function enviarDosVeces(
  handler: Handler,
  body: Record<string, unknown>,
  key: string
) {
  const primera = await pedir(handler, { ...body, idempotencyKey: key });
  const segunda = await pedir(handler, { ...body, idempotencyKey: key });
  return { primera, segunda };
}

async function limpiarOperaciones() {
  const snap = await empresaRef(empresaId).collection("financialOperations").get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function contarSub(uid: string, sub: string): Promise<number> {
  const snap = await empresaRef(empresaId)
    .collection(USUARIOS)
    .doc(uid)
    .collection(sub)
    .get();
  return snap.size;
}

afterAll(async () => {
  await limpiarEmpresa(empresaId);
});

describe("Idempotencia — ingreso a la base del adminEmpresa (crea dinero)", () => {
  beforeEach(async () => {
    await limpiarOperaciones();
    const ingresos = await empresaRef(empresaId)
      .collection(USUARIOS)
      .doc(adminEmpresaUid)
      .collection("ingresosBaseAdminEmpresa")
      .get();
    await Promise.all(ingresos.docs.map((d) => d.ref.delete()));

    await empresaRef(empresaId).collection(USUARIOS).doc(adminEmpresaUid).set({
      rol: "adminEmpresa",
      role: "adminEmpresa",
      nombre: "Admin empresa",
      cajaAdmin: 0,
    });
    usuarioActual = { uid: adminEmpresaUid, empresaId, role: "adminEmpresa" };
  });

  it("el reintento con la misma clave no ingresa el dinero dos veces", async () => {
    const { primera, segunda } = await enviarDosVeces(
      postIngresarBase,
      { monto: 500_000 },
      "clave-ingreso-1"
    );

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);

    const admin = await leerUsuario(empresaId, adminEmpresaUid);
    expect(num(admin.cajaAdmin)).toBe(500_000);
    expect(await contarSub(adminEmpresaUid, "ingresosBaseAdminEmpresa")).toBe(1);
  });

  it("la respuesta repetida es idéntica a la original", async () => {
    const { primera, segunda } = await enviarDosVeces(
      postIngresarBase,
      { monto: 300_000 },
      "clave-ingreso-2"
    );

    expect(await primera.json()).toEqual(await segunda.json());
  });

  it("dos ingresos legítimos del mismo monto sí se acreditan los dos", async () => {
    await pedir(postIngresarBase, { monto: 500_000, idempotencyKey: "intento-a" });
    await pedir(postIngresarBase, { monto: 500_000, idempotencyKey: "intento-b" });

    const admin = await leerUsuario(empresaId, adminEmpresaUid);
    expect(num(admin.cajaAdmin)).toBe(1_000_000);
    expect(await contarSub(adminEmpresaUid, "ingresosBaseAdminEmpresa")).toBe(2);
  });

  it("cinco envíos simultáneos con la misma clave acreditan una sola vez", async () => {
    await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        pedir(postIngresarBase, { monto: 200_000, idempotencyKey: "clave-carrera" })
      )
    );

    const admin = await leerUsuario(empresaId, adminEmpresaUid);
    expect(num(admin.cajaAdmin)).toBe(200_000);
    expect(await contarSub(adminEmpresaUid, "ingresosBaseAdminEmpresa")).toBe(1);
  });

  it("sin clave sigue funcionando como antes (compatibilidad)", async () => {
    const res = await pedir(postIngresarBase, { monto: 75_000 });

    expect(res.status).toBe(200);
    const admin = await leerUsuario(empresaId, adminEmpresaUid);
    expect(num(admin.cajaAdmin)).toBe(75_000);
  });

  it("un fallo de validación no consume la clave y permite corregir", async () => {
    const malo = await pedir(postIngresarBase, {
      monto: -100,
      idempotencyKey: "clave-reutilizable",
    });
    expect(malo.status).toBe(400);

    const bueno = await pedir(postIngresarBase, {
      monto: 100_000,
      idempotencyKey: "clave-reutilizable",
    });
    expect(bueno.status).toBe(200);

    const admin = await leerUsuario(empresaId, adminEmpresaUid);
    expect(num(admin.cajaAdmin)).toBe(100_000);
  });
});

describe("Idempotencia — inversión del jefe a la caja empresa (crea dinero)", () => {
  beforeEach(async () => {
    await limpiarOperaciones();
    const flujo = await empresaRef(jefeUid)
      .collection("capital")
      .doc("cajaEmpresa")
      .collection("flujo")
      .get();
    await Promise.all(flujo.docs.map((d) => d.ref.delete()));
    await seedCajaEmpresa(jefeUid, 100_000);
    usuarioActual = { uid: jefeUid, empresaId, role: "jefe" };
  });

  it("el reintento con la misma clave no invierte dos veces", async () => {
    const { primera, segunda } = await enviarDosVeces(
      postJefeInvertir,
      { monto: 400_000 },
      "clave-jefe-1"
    );

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await leerCajaEmpresa(jefeUid)).toBe(500_000);
  });

  it("claves distintas invierten las dos veces", async () => {
    await pedir(postJefeInvertir, { monto: 400_000, idempotencyKey: "jefe-a" });
    await pedir(postJefeInvertir, { monto: 400_000, idempotencyKey: "jefe-b" });

    expect(await leerCajaEmpresa(jefeUid)).toBe(900_000);
  });
});

describe("Idempotencia — transferencias entre cajas (mueven dinero)", () => {
  beforeEach(async () => {
    await limpiarOperaciones();
    for (const sub of ["inversionesCajaRuta", "inversionesRutaCajaAdmin"]) {
      const snap = await empresaRef(empresaId)
        .collection(USUARIOS)
        .doc(adminUid)
        .collection(sub)
        .get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
    await seedAdmin({ empresaId, adminUid, cajaAdmin: 300_000 });
    await seedRuta({ empresaId, rutaId, adminId: adminUid, cajaRuta: 300_000 });
    await seedCajaEmpresa(jefeUid, 1_000_000);
  });

  it("jefe → admin: el reintento con la misma clave transfiere una sola vez", async () => {
    usuarioActual = { uid: jefeUid, empresaId, role: "jefe" };

    const { primera, segunda } = await enviarDosVeces(
      postTransferir,
      { adminUid, monto: 250_000 },
      "clave-transfer-1"
    );

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);

    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(admin.cajaAdmin)).toBe(550_000);
    expect(await leerCajaEmpresa(jefeUid)).toBe(750_000);
  });

  it("ruta → caja admin: el reintento con la misma clave retira una sola vez", async () => {
    usuarioActual = { uid: adminUid, empresaId, role: "admin" };

    const { primera, segunda } = await enviarDosVeces(
      postACajaAdmin,
      { rutaId, monto: 120_000 },
      "clave-a-caja-admin"
    );

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);

    const ruta = await leerRuta(empresaId, rutaId);
    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(ruta.cajaRuta)).toBe(180_000);
    expect(num(admin.cajaAdmin)).toBe(420_000);
    expect(await contarSub(adminUid, "inversionesRutaCajaAdmin")).toBe(1);
  });

  it("caja admin → ruta: el reintento con la misma clave inyecta una sola vez", async () => {
    usuarioActual = { uid: adminUid, empresaId, role: "admin" };

    const { primera, segunda } = await enviarDosVeces(
      postACajaRuta,
      { rutaId, monto: 100_000 },
      "clave-a-caja-ruta"
    );

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);

    const ruta = await leerRuta(empresaId, rutaId);
    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(ruta.cajaRuta)).toBe(400_000);
    expect(num(admin.cajaAdmin)).toBe(200_000);
    expect(await contarSub(adminUid, "inversionesCajaRuta")).toBe(1);
  });

  it("claves distintas sí ejecutan las dos transferencias", async () => {
    usuarioActual = { uid: adminUid, empresaId, role: "admin" };

    await pedir(postACajaRuta, { rutaId, monto: 100_000, idempotencyKey: "t-a" });
    await pedir(postACajaRuta, { rutaId, monto: 100_000, idempotencyKey: "t-b" });

    const ruta = await leerRuta(empresaId, rutaId);
    const admin = await leerUsuario(empresaId, adminUid);
    expect(num(ruta.cajaRuta)).toBe(500_000);
    expect(num(admin.cajaAdmin)).toBe(100_000);
  });

  it("el capital no se crea ni se destruye al deduplicar", async () => {
    usuarioActual = { uid: adminUid, empresaId, role: "admin" };
    const totalAntes =
      num((await leerRuta(empresaId, rutaId)).cajaRuta) +
      num((await leerUsuario(empresaId, adminUid)).cajaAdmin);

    await enviarDosVeces(postACajaAdmin, { rutaId, monto: 90_000 }, "clave-invariante");

    const totalDespues =
      num((await leerRuta(empresaId, rutaId)).cajaRuta) +
      num((await leerUsuario(empresaId, adminUid)).cajaAdmin);

    expect(totalDespues).toBe(totalAntes);
  });

  it("la ruta mantiene su invariante de capital tras el reintento", async () => {
    usuarioActual = { uid: adminUid, empresaId, role: "admin" };

    await enviarDosVeces(postACajaAdmin, { rutaId, monto: 90_000 }, "clave-inv-ruta");

    const r = await empresaRef(empresaId).collection(RUTAS).doc(rutaId).get();
    const d = r.data()!;
    const esperado =
      num(d.cajaRuta) + num(d.cajasEmpleados) + num(d.inversiones) - num(d.perdidas);
    expect(Math.abs(num(d.capitalTotal) - esperado)).toBeLessThanOrEqual(0.02);
  });
});
