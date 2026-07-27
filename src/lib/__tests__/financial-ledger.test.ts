import {
  buildAnulacionLedgerDebits,
  buildPagoLedgerCredits,
  isFinancialLedgerEnabled,
} from "@/lib/financial-ledger";

describe("isFinancialLedgerEnabled", () => {
  const prev = process.env.FINANCIAL_LEDGER_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.FINANCIAL_LEDGER_ENABLED;
    else process.env.FINANCIAL_LEDGER_ENABLED = prev;
  });

  it("está apagado por defecto", () => {
    delete process.env.FINANCIAL_LEDGER_ENABLED;
    expect(isFinancialLedgerEnabled()).toBe(false);
  });

  it("solo se enciende con '1'", () => {
    process.env.FINANCIAL_LEDGER_ENABLED = "1";
    expect(isFinancialLedgerEnabled()).toBe(true);
    process.env.FINANCIAL_LEDGER_ENABLED = "true";
    expect(isFinancialLedgerEnabled()).toBe(false);
  });
});

describe("buildPagoLedgerCredits", () => {
  it("admin: balanceAfter solo en el último movimiento", () => {
    const specs = buildPagoLedgerCredits({
      acreditaCajaRuta: true,
      rutaId: "ruta-1",
      empleadoId: null,
      pagoId: "pago-1",
      cuotaCapital: 80_000,
      cuotaGanancia: 20_000,
      walletBalanceAfter: 1_100_000,
      createdBy: "admin-1",
      prestamoId: "p-1",
      metodoPago: "efectivo",
    });
    expect(specs).toHaveLength(2);
    expect(specs[0].operationId).toBe("pago_capital:pago-1");
    expect(specs[0].balanceAfter).toBeUndefined();
    expect(specs[0].walletType).toBe("ruta_caja");
    expect(specs[1].operationId).toBe("pago_interes:pago-1");
    expect(specs[1].balanceAfter).toBe(1_100_000);
    expect(specs[1].direction).toBe("credit");
  });

  it("empleado: misma simetría de balanceAfter", () => {
    const specs = buildPagoLedgerCredits({
      acreditaCajaRuta: false,
      rutaId: "ruta-1",
      empleadoId: "emp-1",
      pagoId: "pago-2",
      cuotaCapital: 40_000,
      cuotaGanancia: 10_000,
      walletBalanceAfter: 250_000,
      createdBy: "emp-1",
      prestamoId: "p-1",
      metodoPago: "efectivo",
    });
    expect(specs[0].walletType).toBe("empleado_caja");
    expect(specs[0].balanceAfter).toBeUndefined();
    expect(specs[1].balanceAfter).toBe(250_000);
  });

  it("solo capital: balanceAfter en ese único movimiento", () => {
    const specs = buildPagoLedgerCredits({
      acreditaCajaRuta: true,
      rutaId: "ruta-1",
      empleadoId: null,
      pagoId: "pago-3",
      cuotaCapital: 50_000,
      cuotaGanancia: 0,
      walletBalanceAfter: 900_000,
      createdBy: "admin-1",
      prestamoId: "p-1",
      metodoPago: "transferencia",
    });
    expect(specs).toHaveLength(1);
    expect(specs[0].balanceAfter).toBe(900_000);
  });

  it("sin walletId: lista vacía", () => {
    expect(
      buildPagoLedgerCredits({
        acreditaCajaRuta: true,
        rutaId: null,
        empleadoId: null,
        pagoId: "pago-4",
        cuotaCapital: 10,
        cuotaGanancia: 0,
        createdBy: "a",
        prestamoId: "p",
        metodoPago: "efectivo",
      })
    ).toEqual([]);
  });
});

describe("buildAnulacionLedgerDebits", () => {
  it("espejo del cobro con débitos y balanceAfter final", () => {
    const specs = buildAnulacionLedgerDebits({
      acreditaCajaRuta: false,
      rutaId: "ruta-1",
      empleadoId: "emp-1",
      pagoId: "pago-9",
      cuotaCapital: 40_000,
      cuotaGanancia: 10_000,
      walletBalanceAfter: 200_000,
      createdBy: "admin-1",
      prestamoId: "p-1",
      modo: "snapshots",
    });
    expect(specs).toHaveLength(2);
    expect(specs[0].direction).toBe("debit");
    expect(specs[0].operationId).toBe("anulacion_capital:pago-9");
    expect(specs[1].balanceAfter).toBe(200_000);
  });
});
