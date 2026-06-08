import {
  computeRutaCamposTrasCobroPrestamo,
  computeRutaCamposTrasCobroPrestamoCobroEnEmpleado,
  computeRutaCamposTrasPerdidaPrestamo,
  computeSaldosTrasDesembolsoPrestamoDesdeCajaEmpleado,
  splitMontoPagoEnCapitalYGanancia,
  round2,
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

describe("computeRutaCamposTrasPerdidaPrestamo", () => {
  const rutaBase = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 800_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 2_300_000,
  };

  it("inversiones bajan el monto completo de la pérdida", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      175_000,
      500_000,
      600_000
    );
    expect(result.inversiones).toBe(625_000); // 800k - 175k
  });

  it("pérdidas informativas suben", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      175_000,
      500_000,
      600_000
    );
    expect(result.perdidas).toBe(175_000);
  });

  it("capital total baja exactamente el monto de la pérdida", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      175_000,
      500_000,
      600_000
    );
    const nuevoCapital = rutaBase.cajaRuta + rutaBase.cajasEmpleados + result.inversiones;
    expect(round2(nuevoCapital)).toBeCloseTo(2_125_000, 0);
  });

  it("no descuenta más de las inversiones disponibles", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      999_999_999,
      500_000,
      600_000 // monto absurdo
    );
    expect(result.inversiones).toBeGreaterThanOrEqual(0);
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

describe("computeRutaCamposTrasPerdidaPrestamo — casos borde", () => {
  const rutaBase = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 800_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 2_300_000,
  };

  it("lanza error si monto es 0 o negativo (línea 156)", () => {
    expect(() =>
      computeRutaCamposTrasPerdidaPrestamo(rutaBase, 0, 500_000, 600_000)
    ).toThrow();
  });

  it("lanza error si capital descuadrado (línea 180)", () => {
    const rutaDescuadrada = {
      ...rutaBase,
      capitalTotal: 999_999_999,
    };
    expect(() =>
      computeRutaCamposTrasPerdidaPrestamo(
        rutaDescuadrada,
        100_000,
        500_000,
        600_000
      )
    ).toThrow();
  });

  it("pérdida sin inversiones deja inversiones en cero — no negativas (guard línea 183)", () => {
    const rutaSinInversiones = {
      ...rutaBase,
      inversiones: 0,
      capitalTotal: 1_500_000,
    };
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaSinInversiones,
      999_999,
      500_000,
      600_000
    );
    expect(result.inversiones).toBe(0);
    expect(result.inversiones).toBeGreaterThanOrEqual(0);
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
