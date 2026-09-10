/**
 * Aprobación concurrente de una solicitud de préstamo.
 *
 * Antes del fix la solicitud se leía fuera de la transacción y nunca se releía
 * dentro, así que dos aprobaciones simultáneas creaban dos préstamos y
 * descontaban dos veces la caja del trabajador. Este test falla contra ese
 * código y es la razón principal de este cambio.
 */

import type { NextRequest } from "next/server";
import type { ApiUser } from "@/lib/api-auth";
import {
  assertInvarianteRuta,
  db,
  empresaRef,
  leerRuta,
  leerUsuario,
  limpiarEmpresa,
  nuevaEmpresaId,
  num,
  PRESTAMOS,
  seedAdmin,
  seedCliente,
  seedEmpleado,
  seedRuta,
  SOLICITUDES_PRESTAMO,
} from "./helpers";

const empresaId = nuevaEmpresaId("aprobar");
const adminUid = "admin-1";
const empleadoUid = "empleado-1";
const rutaId = "ruta-1";

let usuarioActual: ApiUser = {
  uid: adminUid,
  empresaId,
  role: "admin",
};

jest.mock("@/lib/api-auth", () => ({
  getApiUser: jest.fn(async () => usuarioActual),
}));

jest.mock("@/lib/firebase-admin", () => ({
  getAdminFirestore: () => require("./helpers").db,
  getAdminMessaging: () => ({ send: async () => undefined }),
}));

jest.mock("@/lib/fcm-notify-empleado", () => ({
  notifyEmpleadoSolicitudResuelta: async () => undefined,
}));

// Import diferido: los mocks deben registrarse antes de cargar el handler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { POST } = require("@/app/api/empresa/solicitudes-prestamo/[id]/aprobar/route") as {
  POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

function requestStub(): NextRequest {
  return {
    json: async () => ({}),
    headers: new Headers(),
  } as unknown as NextRequest;
}

function aprobar(solicitudId: string) {
  return POST(requestStub(), { params: Promise.resolve({ id: solicitudId }) });
}

async function crearSolicitud(params: {
  solicitudId: string;
  clienteId: string;
  monto: number;
}): Promise<void> {
  await seedCliente({ empresaId, clienteId: params.clienteId, rutaId });
  await empresaRef(empresaId)
    .collection(SOLICITUDES_PRESTAMO)
    .doc(params.solicitudId)
    .set({
      empleadoUid,
      clienteId: params.clienteId,
      clienteNombre: "Cliente de prueba",
      rutaId,
      adminId: adminUid,
      estado: "pendiente",
      monto: params.monto,
      interes: 20,
      numeroCuotas: 20,
      modalidad: "diario",
      fechaInicio: "2026-01-05",
      fechaFinal: "2026-02-05",
      diasCobroModo: "6",
      creadaEn: new Date(),
    });
}

async function contarPrestamosDeSolicitud(solicitudId: string): Promise<number> {
  const snap = await empresaRef(empresaId)
    .collection(PRESTAMOS)
    .where("solicitudId", "==", solicitudId)
    .get();
  return snap.size;
}

describe("Aprobar solicitud de préstamo — concurrencia", () => {
  beforeEach(async () => {
    usuarioActual = { uid: adminUid, empresaId, role: "admin" };
    await seedAdmin({ empresaId, adminUid, cajaAdmin: 0 });
    await seedRuta({
      empresaId,
      rutaId,
      adminId: adminUid,
      cajaRuta: 0,
      cajasEmpleados: 300_000,
      inversiones: 0,
    });
    await seedEmpleado({
      empresaId,
      empleadoUid,
      rutaId,
      adminId: adminUid,
      cajaEmpleado: 300_000,
    });
  });

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
  });

  it("cinco aprobaciones simultáneas crean un único préstamo y descuentan una sola vez", async () => {
    const solicitudId = "sol-concurrente";
    const monto = 100_000;
    await crearSolicitud({ solicitudId, clienteId: "cliente-conc", monto });

    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () => aprobar(solicitudId))
    );

    // Las llamadas que no ganan el lock reciben 409 (mientras corre) o el
    // resultado idempotente de la que sí lo ganó. Ninguna desembolsa de nuevo:
    // todas las respuestas exitosas apuntan al mismo préstamo.
    const exitosas = respuestas.filter((r) => r.status === 200);
    expect(exitosas.length).toBeGreaterThanOrEqual(1);

    const prestamoIds = new Set(
      await Promise.all(exitosas.map(async (r) => (await r.json()).prestamoId))
    );
    expect(prestamoIds.size).toBe(1);

    expect(await contarPrestamosDeSolicitud(solicitudId)).toBe(1);

    const empleado = await leerUsuario(empresaId, empleadoUid);
    expect(num(empleado.cajaEmpleado)).toBe(200_000);

    const ruta = await leerRuta(empresaId, rutaId);
    expect(num(ruta.inversiones)).toBe(monto);
    expect(num(ruta.cajasEmpleados)).toBe(200_000);
    await assertInvarianteRuta(empresaId, rutaId);

    const sol = await empresaRef(empresaId)
      .collection(SOLICITUDES_PRESTAMO)
      .doc(solicitudId)
      .get();
    expect(sol.data()?.estado).toBe("aprobada");
    expect(typeof sol.data()?.prestamoId).toBe("string");
  });

  it("una segunda aprobación secuencial no vuelve a desembolsar", async () => {
    const solicitudId = "sol-secuencial";
    await crearSolicitud({ solicitudId, clienteId: "cliente-sec", monto: 50_000 });

    const primera = await aprobar(solicitudId);
    expect(primera.status).toBe(200);

    const segunda = await aprobar(solicitudId);
    // Replay idempotente del éxito, o rechazo por solicitud ya resuelta.
    expect([200, 400]).toContain(segunda.status);

    expect(await contarPrestamosDeSolicitud(solicitudId)).toBe(1);
    const empleado = await leerUsuario(empresaId, empleadoUid);
    expect(num(empleado.cajaEmpleado)).toBe(250_000);
  });

  it("no desembolsa nada si el trabajador no tiene saldo suficiente", async () => {
    const solicitudId = "sol-sin-saldo";
    await crearSolicitud({ solicitudId, clienteId: "cliente-sin", monto: 900_000 });

    const respuesta = await aprobar(solicitudId);
    expect(respuesta.status).toBe(400);

    expect(await contarPrestamosDeSolicitud(solicitudId)).toBe(0);
    const empleado = await leerUsuario(empresaId, empleadoUid);
    expect(num(empleado.cajaEmpleado)).toBe(300_000);

    const sol = await empresaRef(empresaId)
      .collection(SOLICITUDES_PRESTAMO)
      .doc(solicitudId)
      .get();
    expect(sol.data()?.estado).toBe("pendiente");
    await assertInvarianteRuta(empresaId, rutaId);
  });

  it("rechaza al cliente moroso sin tocar el dinero", async () => {
    const solicitudId = "sol-moroso";
    await crearSolicitud({ solicitudId, clienteId: "cliente-moroso", monto: 10_000 });
    await empresaRef(empresaId)
      .collection("clientes")
      .doc("cliente-moroso")
      .set({ moroso: true }, { merge: true });

    const respuesta = await aprobar(solicitudId);
    expect(respuesta.status).toBe(400);

    expect(await contarPrestamosDeSolicitud(solicitudId)).toBe(0);
    const empleado = await leerUsuario(empresaId, empleadoUid);
    expect(num(empleado.cajaEmpleado)).toBe(300_000);
  });

  it("un admin ajeno no puede aprobar la solicitud", async () => {
    const solicitudId = "sol-otro-admin";
    await crearSolicitud({ solicitudId, clienteId: "cliente-otro", monto: 10_000 });

    usuarioActual = { uid: "admin-2", empresaId, role: "admin" };
    const respuesta = await aprobar(solicitudId);

    expect(respuesta.status).toBe(403);
    expect(await contarPrestamosDeSolicitud(solicitudId)).toBe(0);
  });

  it("deja el asiento del desembolso registrado en el ledger", async () => {
    const solicitudId = "sol-ledger";
    await crearSolicitud({ solicitudId, clienteId: "cliente-ledger", monto: 40_000 });

    const respuesta = await aprobar(solicitudId);
    expect(respuesta.status).toBe(200);

    const prestamoId = (await respuesta.json()).prestamoId as string;
    const movimiento = await empresaRef(empresaId)
      .collection("financialMovements")
      .doc(`prestamo:${prestamoId}`)
      .get();

    expect(movimiento.exists).toBe(true);
    expect(movimiento.data()?.direction).toBe("debit");
    expect(movimiento.data()?.amount).toBe(40_000);
  });

  afterEach(async () => {
    const prestamos = await empresaRef(empresaId).collection(PRESTAMOS).get();
    await Promise.all(prestamos.docs.map((d) => d.ref.delete()));
    const ops = await empresaRef(empresaId).collection("financialOperations").get();
    await Promise.all(ops.docs.map((d) => d.ref.delete()));
  });
});

// `db` se referencia para forzar la conexión al emulador antes de los mocks.
void db;
