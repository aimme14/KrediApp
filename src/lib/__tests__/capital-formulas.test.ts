import {
  computeCapitalTotalRutaDesdeSaldos,
  computeCapitalAdmin,
  computeCapitalEmpresa,
  computeCapitalRutaParaSumaAdmin,
  computeCapitalRutaFromRutaFields,
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

describe("computeCapitalEmpresa", () => {
  it("suma cajaEmpresa + sumaCapitalAdmins", () => {
    expect(computeCapitalEmpresa(5_000_000, 10_000_000)).toBe(15_000_000);
  });

  it("sin admins — solo cajaEmpresa", () => {
    expect(computeCapitalEmpresa(3_000_000, 0)).toBe(3_000_000);
  });

  it("ambos en cero — retorna cero", () => {
    expect(computeCapitalEmpresa(0, 0)).toBe(0);
  });
});

describe("computeCapitalRutaParaSumaAdmin", () => {
  it("usa capitalTotal persistido si existe", () => {
    expect(
      computeCapitalRutaParaSumaAdmin({
        cajaRuta: 1_000_000,
        cajasEmpleados: 500_000,
        inversiones: 800_000,
        capitalTotal: 9_999_999, // tiene capitalTotal → lo usa
      })
    ).toBe(9_999_999);
  });

  it("calcula desde saldos si no hay capitalTotal", () => {
    expect(
      computeCapitalRutaParaSumaAdmin({
        cajaRuta: 1_000_000,
        cajasEmpleados: 500_000,
        inversiones: 800_000,
      })
    ).toBe(2_300_000);
  });
});

describe("computeCapitalRutaFromRutaFields", () => {
  it("ignora ganancias y pérdidas — solo saldos", () => {
    const conGanancias = computeCapitalRutaFromRutaFields({
      cajaRuta: 1_000_000,
      cajasEmpleados: 500_000,
      inversiones: 800_000,
      ganancias: 999_999,
      perdidas: 999_999,
    });
    expect(conGanancias).toBe(2_300_000);
  });

  it("resultado igual a computeCapitalTotalRutaDesdeSaldos", () => {
    const params = {
      cajaRuta: 1_000_000,
      cajasEmpleados: 500_000,
      inversiones: 800_000,
    };
    expect(computeCapitalRutaFromRutaFields({ ...params, ganancias: 0 })).toBe(
      computeCapitalTotalRutaDesdeSaldos(params)
    );
  });
});
