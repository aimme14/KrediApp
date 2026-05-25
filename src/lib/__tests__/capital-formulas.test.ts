import {
  computeCapitalTotalRutaDesdeSaldos,
  computeCapitalAdmin,
} from "@/lib/capital-formulas";

describe("computeCapitalTotalRutaDesdeSaldos", () => {
  it("suma cajaRuta + cajasEmpleados + inversiones", () => {
    expect(
      computeCapitalTotalRutaDesdeSaldos({
        cajaRuta: 1_000_000,
        cajasEmpleados: 500_000,
        inversiones: 800_000,
      })
    ).toBe(2_300_000);
  });

  it("perdidas no afectan el capital total", () => {
    const sinPerdidas = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta: 1_000_000,
      cajasEmpleados: 500_000,
      inversiones: 800_000,
    });
    const conPerdidas = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta: 1_000_000,
      cajasEmpleados: 500_000,
      inversiones: 800_000,
      perdidas: 100_000,
    });
    expect(sinPerdidas).toBe(conPerdidas);
  });

  it("valores en cero retorna cero", () => {
    expect(
      computeCapitalTotalRutaDesdeSaldos({
        cajaRuta: 0,
        cajasEmpleados: 0,
        inversiones: 0,
      })
    ).toBe(0);
  });
});

describe("computeCapitalAdmin", () => {
  it("suma cajaAdmin + sumaCapitalRutas", () => {
    expect(
      computeCapitalAdmin({
        cajaAdmin: 2_000_000,
        sumaCapitalRutas: 5_000_000,
      })
    ).toBe(7_000_000);
  });

  it("sin rutas — solo cajaAdmin", () => {
    expect(
      computeCapitalAdmin({
        cajaAdmin: 2_000_000,
        sumaCapitalRutas: 0,
      })
    ).toBe(2_000_000);
  });
});
