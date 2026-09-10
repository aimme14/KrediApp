/**
 * Concurrencia sobre las cajas de jefe y admin.
 *
 * Antes del fix estas funciones hacían read-modify-write fuera de transacción:
 * dos operaciones simultáneas leían el mismo saldo y la segunda escritura
 * pisaba a la primera, dejando dinero descontado sin registrar o saldos
 * negativos. Estos tests fallan contra ese código.
 */

import { descontarCajaAdmin, getCajaAdmin, sumarCajaAdmin } from "@/lib/admin-capital";
import { descontarCajaEmpresa } from "@/lib/jefe-capital";
import {
  contarResultados,
  leerCajaEmpresa,
  limpiarEmpresa,
  nuevaEmpresaId,
  db,
  seedAdmin,
  seedCajaEmpresa,
} from "./helpers";

describe("Concurrencia — caja del administrador", () => {
  const empresaId = nuevaEmpresaId("caja-admin");
  const adminUid = "admin-1";

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
  });

  beforeEach(async () => {
    await seedAdmin({ empresaId, adminUid, cajaAdmin: 100_000 });
  });

  it("con saldo justo para un gasto, solo uno de cinco intentos concurrentes pasa", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        descontarCajaAdmin(db, empresaId, adminUid, 100_000, "gasto concurrente")
      )
    );

    const { exitos, fallos } = contarResultados(resultados);
    expect(exitos).toBe(1);
    expect(fallos).toBe(4);
    expect(await getCajaAdmin(db, empresaId, adminUid)).toBe(0);
  });

  it("diez débitos concurrentes descuentan exactamente su suma, sin perder ninguno", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        descontarCajaAdmin(db, empresaId, adminUid, 5_000, "gasto")
      )
    );

    expect(contarResultados(resultados).exitos).toBe(10);
    expect(await getCajaAdmin(db, empresaId, adminUid)).toBe(50_000);
  });

  it("débitos y créditos mezclados dejan el saldo aritméticamente correcto", async () => {
    const operaciones = [
      ...Array.from({ length: 6 }, () =>
        descontarCajaAdmin(db, empresaId, adminUid, 10_000, "gasto")
      ),
      ...Array.from({ length: 4 }, () =>
        sumarCajaAdmin(db, empresaId, adminUid, 7_500)
      ),
    ];

    const resultados = await Promise.allSettled(operaciones);
    expect(contarResultados(resultados).fallos).toBe(0);

    // 100.000 − 6×10.000 + 4×7.500
    expect(await getCajaAdmin(db, empresaId, adminUid)).toBe(70_000);
  });

  it("nunca deja la caja en negativo aunque se pidan más débitos que saldo", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        descontarCajaAdmin(db, empresaId, adminUid, 30_000, "gasto")
      )
    );

    const { exitos } = contarResultados(resultados);
    const saldo = await getCajaAdmin(db, empresaId, adminUid);

    // Con 20 transacciones peleando por el mismo documento, algunas agotan sus
    // reintentos y abortan; eso es contención legítima, no pérdida de dinero.
    // Lo que no puede fallar: el saldo refleja exactamente los débitos que
    // efectivamente pasaron, y nunca baja de cero.
    expect(exitos).toBeGreaterThanOrEqual(1);
    expect(exitos).toBeLessThanOrEqual(3); // 3 × 30.000 = 90.000 de 100.000
    expect(saldo).toBe(100_000 - exitos * 30_000);
    expect(saldo).toBeGreaterThanOrEqual(0);
  });

  it("rechaza con el mensaje de negocio cuando no hay saldo", async () => {
    await expect(
      descontarCajaAdmin(db, empresaId, adminUid, 200_000, "gasto")
    ).rejects.toThrow("Saldo insuficiente en base del administrador");
  });
});

describe("Concurrencia — caja de la empresa", () => {
  const jefeUid = nuevaEmpresaId("caja-empresa");

  afterAll(async () => {
    await limpiarEmpresa(jefeUid);
  });

  beforeEach(async () => {
    const flujo = await flujoCajaEmpresa(jefeUid).get();
    await Promise.all(flujo.docs.map((d) => d.ref.delete()));
    await seedCajaEmpresa(jefeUid, 500_000);
  });

  function flujoCajaEmpresa(uid: string) {
    return db
      .collection("empresas")
      .doc(uid)
      .collection("capital")
      .doc("cajaEmpresa")
      .collection("flujo");
  }

  it("ocho gastos concurrentes descuentan exactamente su suma", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, () => descontarCajaEmpresa(db, jefeUid, 25_000, "gasto"))
    );

    expect(contarResultados(resultados).fallos).toBe(0);
    expect(await leerCajaEmpresa(jefeUid)).toBe(300_000);
  });

  it("con saldo justo para uno, solo uno de seis intentos pasa", async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 6 }, () => descontarCajaEmpresa(db, jefeUid, 500_000, "gasto"))
    );

    expect(contarResultados(resultados).exitos).toBe(1);
    expect(await leerCajaEmpresa(jefeUid)).toBe(0);
  });

  it("registra un movimiento de flujo por cada gasto aplicado", async () => {
    await Promise.all([
      descontarCajaEmpresa(db, jefeUid, 10_000, "gasto"),
      descontarCajaEmpresa(db, jefeUid, 20_000, "gasto"),
      descontarCajaEmpresa(db, jefeUid, 30_000, "gasto"),
    ]);

    const flujo = await flujoCajaEmpresa(jefeUid)
      .where("tipo", "==", "gasto_empresa")
      .get();

    expect(flujo.size).toBe(3);
    expect(await leerCajaEmpresa(jefeUid)).toBe(440_000);
  });
});
