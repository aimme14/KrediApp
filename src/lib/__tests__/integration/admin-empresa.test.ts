/**
 * Flujos del rol `adminEmpresa`.
 *
 * Este rol comparte los endpoints del panel de admin (`isAdminPanelApiUser`),
 * pero además tiene uno propio: el ingreso de liquidez externa a su base.
 * Antes del fix ese ingreso acreditaba la caja y **después** escribía el
 * documento del historial, así que un fallo entre ambos pasos dejaba dinero
 * en la caja sin registro de su origen.
 */

import { ingresarBaseAdminEmpresa } from "@/lib/admin-empresa-capital";
import { getCajaAdmin } from "@/lib/admin-capital";
import * as ledger from "@/lib/financial-ledger";
import {
  contarResultados,
  db,
  empresaRef,
  limpiarEmpresa,
  nuevaEmpresaId,
  num,
  USUARIOS,
} from "./helpers";

const empresaId = nuevaEmpresaId("admin-empresa");
const adminEmpresaUid = "admin-empresa-1";
const INGRESOS = "ingresosBaseAdminEmpresa";

async function seedAdminEmpresa(cajaAdmin: number) {
  await empresaRef(empresaId).collection(USUARIOS).doc(adminEmpresaUid).set({
    rol: "adminEmpresa",
    role: "adminEmpresa",
    nombre: "Admin de empresa",
    email: "admin-empresa@test.local",
    cajaAdmin,
  });
}

function ingresosCol() {
  return empresaRef(empresaId)
    .collection(USUARIOS)
    .doc(adminEmpresaUid)
    .collection(INGRESOS);
}

describe("adminEmpresa — ingreso de liquidez a su base", () => {
  beforeEach(async () => {
    const previos = await ingresosCol().get();
    await Promise.all(previos.docs.map((d) => d.ref.delete()));
    await seedAdminEmpresa(0);
  });

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
  });

  it("acredita la caja y registra el ingreso en el historial", async () => {
    const { cajaAdmin } = await ingresarBaseAdminEmpresa(
      db,
      empresaId,
      adminEmpresaUid,
      250_000
    );

    expect(cajaAdmin).toBe(250_000);
    expect(await getCajaAdmin(db, empresaId, adminEmpresaUid)).toBe(250_000);

    const ingresos = await ingresosCol().get();
    expect(ingresos.size).toBe(1);
    expect(num(ingresos.docs[0].data().monto)).toBe(250_000);
    expect(num(ingresos.docs[0].data().cajaAnterior)).toBe(0);
    expect(num(ingresos.docs[0].data().cajaNueva)).toBe(250_000);
  });

  it("cada ingreso concurrente deja exactamente un documento y suma completo", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, 50_000)
      )
    );

    expect(contarResultados(resultados).fallos).toBe(0);

    const ingresos = await ingresosCol().get();
    const saldo = await getCajaAdmin(db, empresaId, adminEmpresaUid);

    // La invariante que importa: el saldo es la suma de los ingresos registrados.
    const sumaHistorial = ingresos.docs.reduce((s, d) => s + num(d.data().monto), 0);
    expect(ingresos.size).toBe(6);
    expect(saldo).toBe(300_000);
    expect(saldo).toBe(sumaHistorial);
  });

  it("un usuario que no es adminEmpresa no puede ingresar ni deja rastro", async () => {
    await empresaRef(empresaId)
      .collection(USUARIOS)
      .doc(adminEmpresaUid)
      .set({ rol: "admin", role: "admin", cajaAdmin: 100_000 });

    await expect(
      ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, 80_000)
    ).rejects.toThrow("Solo un administrador de empresa puede registrar este ingreso");

    expect(await getCajaAdmin(db, empresaId, adminEmpresaUid)).toBe(100_000);
    expect((await ingresosCol().get()).size).toBe(0);
  });

  it("rechaza montos no positivos sin tocar la caja", async () => {
    await ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, 10_000);

    await expect(
      ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, 0)
    ).rejects.toThrow("El monto debe ser mayor a 0");
    await expect(
      ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, -5_000)
    ).rejects.toThrow("El monto debe ser mayor a 0");

    expect(await getCajaAdmin(db, empresaId, adminEmpresaUid)).toBe(10_000);
    expect((await ingresosCol().get()).size).toBe(1);
  });

  it("un adminEmpresa inexistente no crea caja de la nada", async () => {
    await expect(
      ingresarBaseAdminEmpresa(db, empresaId, "no-existe", 30_000)
    ).rejects.toThrow("Administrador de empresa no encontrado");

    const doc = await empresaRef(empresaId).collection(USUARIOS).doc("no-existe").get();
    expect(doc.exists).toBe(false);
  });

  it("un fallo dentro de la transacción no deja ni dinero ni historial", async () => {
    await ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, 40_000);
    const saldoAntes = await getCajaAdmin(db, empresaId, adminEmpresaUid);
    const historialAntes = (await ingresosCol().get()).size;

    // Fallo inyectado después de acreditar la caja y escribir el historial.
    // Con ambos pasos en la misma transacción, los dos se revierten.
    const spy = jest
      .spyOn(ledger, "enqueueLedgerOutboxInTx")
      .mockImplementation(() => {
        throw new Error("fallo inyectado tras acreditar");
      });

    try {
      await expect(
        ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, 500_000)
      ).rejects.toThrow("fallo inyectado tras acreditar");
    } finally {
      spy.mockRestore();
    }

    expect(await getCajaAdmin(db, empresaId, adminEmpresaUid)).toBe(saldoAntes);
    expect((await ingresosCol().get()).size).toBe(historialAntes);
  });

  it("deja el asiento del ingreso registrado en el ledger", async () => {
    await ingresarBaseAdminEmpresa(db, empresaId, adminEmpresaUid, 120_000);

    const ingresos = await ingresosCol().get();
    const ingresoId = ingresos.docs[0].id;

    const movimiento = await empresaRef(empresaId)
      .collection("financialMovements")
      .doc(`ingreso-base:${ingresoId}`)
      .get();

    expect(movimiento.exists).toBe(true);
    expect(movimiento.data()?.direction).toBe("credit");
    expect(num(movimiento.data()?.amount)).toBe(120_000);
    expect(movimiento.data()?.walletType).toBe("admin_caja");
  });
});
