/**
 * Atomicidad del registro de gastos.
 *
 * Antes del fix el débito de caja y la creación del documento del gasto eran
 * dos operaciones separadas: un fallo entre ambas dejaba la caja rebajada sin
 * registro contable, o el registro sin respaldo de caja.
 */

import type { NextRequest } from "next/server";
import type { ApiUser } from "@/lib/api-auth";
import {
  assertInvarianteRuta,
  contarResultados,
  db,
  empresaRef,
  GASTOS_ADMIN,
  GASTOS_EMPLEADO,
  GASTOS_EMPRESA,
  leerCajaEmpresa,
  leerRuta,
  leerUsuario,
  limpiarEmpresa,
  nuevaEmpresaId,
  num,
  seedAdmin,
  seedCajaEmpresa,
  seedEmpleado,
  seedRuta,
} from "./helpers";

const empresaId = nuevaEmpresaId("gastos");
const adminUid = "admin-1";
const empleadoUid = "empleado-1";
const rutaId = "ruta-1";

let usuarioActual: ApiUser = { uid: adminUid, empresaId, role: "admin" };

jest.mock("@/lib/api-auth", () => ({
  getApiUser: jest.fn(async () => usuarioActual),
}));

jest.mock("@/lib/firebase-admin", () => ({
  getAdminFirestore: () => require("./helpers").db,
  getAdminMessaging: () => ({ send: async () => undefined }),
}));

jest.mock("@/lib/fcm-notify-admin", () => ({
  notifyAdminGastoEmpleado: async () => undefined,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { POST } = require("@/app/api/empresa/gastos/route") as {
  POST: (req: NextRequest) => Promise<Response>;
};

function crearGasto(body: Record<string, unknown>) {
  return POST({
    json: async () => body,
    headers: new Headers(),
  } as unknown as NextRequest);
}

describe("Gastos — atomicidad y concurrencia", () => {
  beforeEach(async () => {
    await seedAdmin({ empresaId, adminUid, cajaAdmin: 200_000 });
    await seedRuta({
      empresaId,
      rutaId,
      adminId: adminUid,
      cajaRuta: 150_000,
      cajasEmpleados: 80_000,
    });
    await seedEmpleado({
      empresaId,
      empleadoUid,
      rutaId,
      adminId: adminUid,
      cajaEmpleado: 80_000,
    });
    await seedCajaEmpresa(empresaId, 400_000);
  });

  afterEach(async () => {
    for (const col of [GASTOS_ADMIN, GASTOS_EMPRESA, GASTOS_EMPLEADO, "financialOperations"]) {
      const snap = await empresaRef(empresaId).collection(col).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  });

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
  });

  describe("gasto contra la caja del administrador", () => {
    beforeEach(() => {
      usuarioActual = { uid: adminUid, empresaId, role: "admin" };
    });

    it("descuenta la caja y crea el documento del gasto", async () => {
      const respuesta = await crearGasto({
        descripcion: "Combustible",
        monto: 50_000,
        tipo: "transporte",
        alcance: "admin",
      });

      expect(respuesta.status).toBe(200);
      const { id } = await respuesta.json();

      const admin = await leerUsuario(empresaId, adminUid);
      expect(num(admin.cajaAdmin)).toBe(150_000);

      const gasto = await empresaRef(empresaId).collection(GASTOS_ADMIN).doc(id).get();
      expect(gasto.exists).toBe(true);
      expect(num(gasto.data()?.monto)).toBe(50_000);
    });

    it("sin saldo suficiente no descuenta ni deja documento de gasto", async () => {
      const respuesta = await crearGasto({
        descripcion: "Gasto imposible",
        monto: 500_000,
        tipo: "otro",
        alcance: "admin",
      });

      expect(respuesta.status).toBe(400);

      const admin = await leerUsuario(empresaId, adminUid);
      expect(num(admin.cajaAdmin)).toBe(200_000);

      const gastos = await empresaRef(empresaId).collection(GASTOS_ADMIN).get();
      expect(gastos.size).toBe(0);
    });

    it("con saldo justo para uno, solo un gasto concurrente pasa y la caja no queda negativa", async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () =>
          crearGasto({
            descripcion: "Gasto concurrente",
            monto: 200_000,
            tipo: "otro",
            alcance: "admin",
          })
        )
      );

      const exitosas = respuestas.filter((r) => r.status === 200);
      expect(exitosas.length).toBe(1);

      const admin = await leerUsuario(empresaId, adminUid);
      expect(num(admin.cajaAdmin)).toBe(0);

      const gastos = await empresaRef(empresaId).collection(GASTOS_ADMIN).get();
      expect(gastos.size).toBe(1);
    });

    it("el número de documentos de gasto coincide siempre con lo descontado", async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 8 }, () =>
          crearGasto({
            descripcion: "Gasto pequeño",
            monto: 30_000,
            tipo: "otro",
            alcance: "admin",
          })
        )
      );

      const exitosas = respuestas.filter((r) => r.status === 200).length;
      const gastos = await empresaRef(empresaId).collection(GASTOS_ADMIN).get();
      const admin = await leerUsuario(empresaId, adminUid);

      expect(gastos.size).toBe(exitosas);
      expect(num(admin.cajaAdmin)).toBe(200_000 - exitosas * 30_000);
      expect(num(admin.cajaAdmin)).toBeGreaterThanOrEqual(0);
    });

    it("deduplica por clave de idempotencia", async () => {
      const idempotencyKey = "gasto-dedup-1";
      const respuestas = await Promise.all(
        Array.from({ length: 4 }, () =>
          crearGasto({
            descripcion: "Gasto con clave",
            monto: 20_000,
            tipo: "otro",
            alcance: "admin",
            idempotencyKey,
          })
        )
      );

      expect(respuestas.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);

      const gastos = await empresaRef(empresaId).collection(GASTOS_ADMIN).get();
      expect(gastos.size).toBe(1);

      const admin = await leerUsuario(empresaId, adminUid);
      expect(num(admin.cajaAdmin)).toBe(180_000);
    });
  });

  describe("gasto contra la caja de la ruta", () => {
    beforeEach(() => {
      usuarioActual = { uid: adminUid, empresaId, role: "admin" };
    });

    it("descuenta cajaRuta y mantiene la invariante de capital", async () => {
      const respuesta = await crearGasto({
        descripcion: "Peaje",
        monto: 50_000,
        tipo: "transporte",
        alcance: "ruta",
        rutaId,
      });

      expect(respuesta.status).toBe(200);

      const ruta = await leerRuta(empresaId, rutaId);
      expect(num(ruta.cajaRuta)).toBe(100_000);
      expect(num(ruta.gastos)).toBe(50_000);
      await assertInvarianteRuta(empresaId, rutaId);
    });

    it("rechaza con 403 una ruta de otra administración sin crear el gasto", async () => {
      usuarioActual = { uid: "admin-2", empresaId, role: "admin" };

      const respuesta = await crearGasto({
        descripcion: "Gasto ajeno",
        monto: 10_000,
        tipo: "otro",
        alcance: "ruta",
        rutaId,
      });

      expect(respuesta.status).toBe(403);

      const ruta = await leerRuta(empresaId, rutaId);
      expect(num(ruta.cajaRuta)).toBe(150_000);
      const gastos = await empresaRef(empresaId).collection(GASTOS_ADMIN).get();
      expect(gastos.size).toBe(0);
    });
  });

  describe("gasto del jefe contra la caja de la empresa", () => {
    beforeEach(() => {
      usuarioActual = { uid: empresaId, empresaId, role: "jefe" };
    });

    it("descuenta la caja empresa y registra el gasto", async () => {
      const respuesta = await crearGasto({
        descripcion: "Arriendo",
        monto: 120_000,
        tipo: "otro",
      });

      expect(respuesta.status).toBe(200);
      expect(await leerCajaEmpresa(empresaId)).toBe(280_000);

      const gastos = await empresaRef(empresaId).collection(GASTOS_EMPRESA).get();
      expect(gastos.size).toBe(1);
    });

    it("gastos concurrentes nunca dejan la caja empresa negativa", async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 10 }, () =>
          crearGasto({ descripcion: "Gasto", monto: 90_000, tipo: "otro" })
        )
      );

      const exitosas = respuestas.filter((r) => r.status === 200).length;
      const caja = await leerCajaEmpresa(empresaId);
      const gastos = await empresaRef(empresaId).collection(GASTOS_EMPRESA).get();

      expect(caja).toBeGreaterThanOrEqual(0);
      expect(gastos.size).toBe(exitosas);
      expect(caja).toBe(400_000 - exitosas * 90_000);
    });
  });

  describe("gasto del trabajador", () => {
    beforeEach(() => {
      usuarioActual = {
        uid: empleadoUid,
        empresaId,
        role: "empleado",
        rutaId,
        adminId: adminUid,
      };
    });

    it("descuenta cajaEmpleado, cuadra la ruta y crea el documento", async () => {
      const respuesta = await crearGasto({
        descripcion: "Almuerzo",
        monto: 20_000,
        tipo: "alimentacion",
      });

      expect(respuesta.status).toBe(200);

      const empleado = await leerUsuario(empresaId, empleadoUid);
      expect(num(empleado.cajaEmpleado)).toBe(60_000);

      const ruta = await leerRuta(empresaId, rutaId);
      expect(num(ruta.cajasEmpleados)).toBe(60_000);
      await assertInvarianteRuta(empresaId, rutaId);

      const gastos = await empresaRef(empresaId).collection(GASTOS_EMPLEADO).get();
      expect(gastos.size).toBe(1);
    });

    it("gastos concurrentes del trabajador mantienen la invariante de la ruta", async () => {
      const resultados = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          crearGasto({ descripcion: "Gasto", monto: 15_000, tipo: "otro" })
        )
      );

      expect(contarResultados(resultados).fallos).toBe(0);
      await assertInvarianteRuta(empresaId, rutaId);

      const empleado = await leerUsuario(empresaId, empleadoUid);
      const ruta = await leerRuta(empresaId, rutaId);
      const gastos = await empresaRef(empresaId).collection(GASTOS_EMPLEADO).get();

      expect(num(empleado.cajaEmpleado)).toBe(num(ruta.cajasEmpleados));
      expect(num(empleado.cajaEmpleado)).toBe(80_000 - gastos.size * 15_000);
    });
  });
});

void db;
