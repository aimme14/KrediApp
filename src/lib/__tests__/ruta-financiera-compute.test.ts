import {
  computeRutaCamposTrasCobroPrestamo,
  computeRutaCamposTrasCobroPrestamoCobroEnEmpleado,
  computeRutaCamposTrasPerdidaPrestamo,
  computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado,
  splitMontoPagoEnCapitalYGanancia,
  round2,
  snapPesoCOP,
} from "@/lib/ruta-financiera-compute";

describe("splitMontoPagoEnCapitalYGanancia", () => {
  it("divide correctamente con interés del 20%", () => {
    const { capital, ganancia } = splitMontoPagoEnCapitalYGanancia(
      100_000, // monto pago
      500_000, // monto préstamo
      600_000 // totalAPagar (20% interés)
    );
    expect(capital).toBeCloseTo(83_333.33, 0);
    expect(ganancia).toBeCloseTo(16_666.67, 0);
    expect(capital + ganancia).toBeCloseTo(100_000, 0);
  });

  it("sin interés — todo es capital", () => {
    const { capital, ganancia } = splitMontoPagoEnCapitalYGanancia(
      100_000,
      500_000,
      500_000 // sin interés
    );
    expect(capital).toBe(100_000);
    expect(ganancia).toBe(0);
  });

  it("no genera valores negativos", () => {
    const { capital, ganancia } = splitMontoPagoEnCapitalYGanancia(0, 500_000, 600_000);
    expect(capital).toBeGreaterThanOrEqual(0);
    expect(ganancia).toBeGreaterThanOrEqual(0);
  });

  it("3 cuotas de $40.000 en préstamo $100k/$120k — interés total exacto $20.000", () => {
    const montoPrestamo = 100_000;
    const totalAPagar = 120_000;
    const cuota = 40_000;
    let cobradoAntes = 0;
    let gananciaAcum = 0;

    for (let i = 0; i < 3; i++) {
      const { ganancia } = splitMontoPagoEnCapitalYGanancia(
        cuota,
        montoPrestamo,
        totalAPagar,
        cobradoAntes
      );
      gananciaAcum = round2(gananciaAcum + ganancia);
      cobradoAntes = round2(cobradoAntes + cuota);
    }

    expect(snapPesoCOP(gananciaAcum)).toBe(20_000);
  });
});

describe("computeRutaCamposTrasCobroPrestamo — cobro en caja ruta (admin)", () => {
  const rutaBase = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 800_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 2_300_000,
  };

  it("cajaRuta sube el monto cobrado", () => {
    const result = computeRutaCamposTrasCobroPrestamo(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.cajaRuta).toBe(1_100_000);
  });

  it("inversiones bajan en la parte capital", () => {
    const result = computeRutaCamposTrasCobroPrestamo(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.inversiones).toBeLessThan(rutaBase.inversiones);
  });

  it("ganancias suben en la parte interés", () => {
    const result = computeRutaCamposTrasCobroPrestamo(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.ganancias).toBeGreaterThan(rutaBase.ganancias);
  });

  it("capital total sube por la ganancia", () => {
    const result = computeRutaCamposTrasCobroPrestamo(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    const nuevoCapital = result.cajaRuta + rutaBase.cajasEmpleados + result.inversiones;
    expect(round2(nuevoCapital)).toBeGreaterThan(rutaBase.capitalTotal);
  });

  it("sin interés — todo va a capital, ganancias no cambian", () => {
    const result = computeRutaCamposTrasCobroPrestamo(
      rutaBase,
      100_000,
      500_000,
      500_000
    );
    expect(result.ganancias).toBe(rutaBase.ganancias);
    expect(result.inversiones).toBe(700_000); // 800k - 100k
  });

  it("usa defaults si ruta no tiene campos numéricos (línea 46)", () => {
    expect(() =>
      computeRutaCamposTrasCobroPrestamo({} as never, 100_000, 500_000, 600_000)
    ).not.toThrow();
  });
});

describe("computeRutaCamposTrasCobroPrestamoCobroEnEmpleado", () => {
  const rutaBase = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 800_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 2_300_000,
  };

  it("capital total sube solo por la ganancia (interés en caja empleado)", () => {
    const { ganancia } = splitMontoPagoEnCapitalYGanancia(100_000, 500_000, 600_000);
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    const nuevoCapital = result.cajaRuta + result.cajasEmpleados + result.inversiones;
    expect(round2(nuevoCapital)).toBeCloseTo(2_300_000 + ganancia, 0);
    expect(result.capitalTotal).toBe(round2(nuevoCapital));
  });

  it("inversiones bajan en la parte capital del pago", () => {
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.inversiones).toBeLessThan(rutaBase.inversiones);
  });

  it("ganancias suben en la parte interés del pago", () => {
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.ganancias).toBeGreaterThan(rutaBase.ganancias);
  });

  it("caja empleado sube el monto cobrado", () => {
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.montoAcreditarCajaEmpleado).toBe(100_000);
  });
});

describe("computeRutaCamposTrasPerdidaPrestamo — lógica Condición 1/2", () => {
  const rutaBase = {
    cajaRuta: 500_000,
    cajasEmpleados: 200_000,
    inversiones: 300_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 1_000_000,
  };

  it("Cond 1: cobrado $0 — pierde todo el capital", () => {
    const ruta = { ...rutaBase, inversiones: 100_000 };
    const r = computeRutaCamposTrasPerdidaPrestamo(
      ruta,
      120_000,
      100_000,
      120_000,
      0
    );
    expect(r.inversiones).toBe(0);
    expect(r.ganancias).toBe(50_000);
    expect(r.perdidas).toBe(100_000);
    expect(r.capitalTotal).toBe(700_000);
  });

  it("Cond 1: cobrado $50.000 < capital $100.000", () => {
    const gananciaAcumulada = round2(50_000 * (20_000 / 120_000));
    const totalADescontar = round2(50_000 + gananciaAcumulada);
    const ruta = { ...rutaBase, inversiones: totalADescontar };
    const r = computeRutaCamposTrasPerdidaPrestamo(
      ruta,
      70_000,
      100_000,
      120_000,
      50_000
    );
    expect(r.inversiones).toBe(0);
    expect(r.ganancias).toBeCloseTo(50_000 - gananciaAcumulada, 1);
    expect(r.perdidas).toBe(50_000);
    expect(r.capitalTotal).toBe(700_000);
  });

  it("Cond 2: cobrado $100.000 = capital — ganancia neta 0", () => {
    const gananciaAcumulada = round2(100_000 * (20_000 / 120_000));
    const r = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      20_000,
      100_000,
      120_000,
      100_000
    );
    expect(r.inversiones).toBe(300_000);
    expect(r.ganancias).toBeCloseTo(50_000 - gananciaAcumulada + 0, 1);
    expect(r.perdidas).toBe(0);
    expect(r.capitalTotal).toBe(1_000_000);
  });

  it("Cond 2: cobrado $110.000 > capital — ganancia real $10.000", () => {
    const gananciaAcumulada = round2(110_000 * (20_000 / 120_000));
    const gananciaReal = 10_000;
    const r = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      10_000,
      100_000,
      120_000,
      110_000
    );
    expect(r.inversiones).toBe(300_000);
    expect(r.ganancias).toBeCloseTo(50_000 - gananciaAcumulada + gananciaReal, 1);
    expect(r.perdidas).toBe(0);
    expect(r.capitalTotal).toBe(1_000_000);
  });

  it("lanza error si saldoPendiente = 0", () => {
    expect(() =>
      computeRutaCamposTrasPerdidaPrestamo(rutaBase, 0, 100_000, 120_000, 120_000)
    ).toThrow();
  });

  it("Cond 1: inversiones insuficientes — no lanza, no queda negativa", () => {
    const rutaPobre = { ...rutaBase, inversiones: 20_000 };
    const gananciaAcumulada = round2(50_000 * (20_000 / 120_000));
    const r = computeRutaCamposTrasPerdidaPrestamo(
      rutaPobre,
      70_000,
      100_000,
      120_000,
      50_000
    );
    expect(r.inversiones).toBe(0);
    expect(r.perdidas).toBe(50_000);
    expect(r.ganancias).toBeCloseTo(50_000 - gananciaAcumulada, 1);
    expect(r.capitalTotal).toBe(round2(500_000 + 200_000 + 0));
  });

  it("Cond 2: ganancias no queda negativa con datos legacy", () => {
    const rutaBajaGanancia = { ...rutaBase, ganancias: 5_000 };
    const r = computeRutaCamposTrasPerdidaPrestamo(
      rutaBajaGanancia,
      10_000,
      100_000,
      120_000,
      110_000
    );
    expect(r.ganancias).toBeGreaterThanOrEqual(0);
  });

  it("lanza error si cobradoAcumulado > totalAPagar", () => {
    expect(() =>
      computeRutaCamposTrasPerdidaPrestamo(rutaBase, 10_000, 100_000, 120_000, 999_999)
    ).toThrow();
  });
});

describe("splitMontoPagoEnCapitalYGanancia — caso sin interés", () => {
  it("totalAPagar igual a monto — ganancia es cero (línea 22)", () => {
    const { capital, ganancia } = splitMontoPagoEnCapitalYGanancia(
      50_000,
      500_000,
      500_000 // sin interés → ganancia 0
    );
    expect(ganancia).toBe(0);
    expect(capital).toBe(50_000);
  });
});

describe("computeRutaCamposTrasCobroPrestamoCobroEnEmpleado — casos borde", () => {
  const rutaBase = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 800_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 2_300_000,
  };

  it("lanza error si saldos quedan negativos (línea 127)", () => {
    const rutaMala = {
      ...rutaBase,
      cajaRuta: -1,
      inversiones: 0,
      cajasEmpleados: 0,
      capitalTotal: 1_000_000,
    };
    expect(() =>
      computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
        rutaMala,
        999_999_999,
        500_000,
        600_000
      )
    ).toThrow();
  });

  it("cobra con ruta sin campos numéricos — usa defaults (línea 46)", () => {
    const rutaVacia = {} as Record<string, unknown>;
    expect(() =>
      computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
        rutaVacia as never,
        0,
        500_000,
        600_000
      )
    ).not.toThrow();
  });
});

describe("computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado", () => {
  const base = {
    cajaRuta: 500_000,
    cajasEmpleados: 300_000,
    inversiones: 200_000,
    cajaEmp: 150_000,
  };

  it("descuenta caja empleado y mueve a inversiones sin cambiar capital total", () => {
    const monto = 100_000;
    const result = computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado({
      ...base,
      monto,
    });
    expect(result.nuevaCajaEmp).toBe(50_000);
    expect(result.nuevaCajasEmpleados).toBe(200_000);
    expect(result.nuevaInversiones).toBe(300_000);
    expect(result.nuevoCapital).toBe(1_000_000);
  });

  it("lanza SALDO_INSUFICIENTE_EMPLEADO si cajaEmp < monto", () => {
    expect(() =>
      computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado({
        ...base,
        cajaEmp: 50_000,
        monto: 100_000,
      })
    ).toThrow("SALDO_INSUFICIENTE_EMPLEADO");
  });

  it("lanza SALDO_INSUFICIENTE_RUTA si cajasEmpleados < monto", () => {
    expect(() =>
      computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado({
        ...base,
        cajasEmpleados: 50_000,
        monto: 100_000,
      })
    ).toThrow("SALDO_INSUFICIENTE_RUTA");
  });
});
