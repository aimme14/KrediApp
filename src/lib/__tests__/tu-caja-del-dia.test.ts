import {
  tuCajaEfectivoFormula,
  tuCajaDelDiaFormula,
  tuCajaDelDiaDesdeTotales,
} from "@/lib/tu-caja-del-dia";

describe("tuCajaEfectivoFormula", () => {
  it("calcula correctamente: efectivo + base - gastos - préstamos", () => {
    expect(
      tuCajaEfectivoFormula(
        120_000, // cobros efectivo
        282_000, // base asignada
        2_000, // gastos
        100_000 // préstamos
      )
    ).toBe(300_000);
  });

  it("sin cobros ni gastos — solo base", () => {
    expect(tuCajaEfectivoFormula(0, 200_000, 0, 0)).toBe(200_000);
  });

  it("gastos mayores a cobros — puede ser negativo", () => {
    expect(tuCajaEfectivoFormula(0, 100_000, 150_000, 0)).toBe(-50_000);
  });

  it("todos en cero — retorna cero", () => {
    expect(tuCajaEfectivoFormula(0, 0, 0, 0)).toBe(0);
  });
});

describe("tuCajaDelDiaFormula (línea 12)", () => {
  it("suma cobros + base y resta gastos + préstamos", () => {
    expect(
      tuCajaDelDiaFormula(
        120_000, // cobros
        282_000, // base
        2_000, // gastos
        100_000 // préstamos
      )
    ).toBe(300_000);
  });

  it("sin operaciones — retorna la base", () => {
    expect(tuCajaDelDiaFormula(0, 200_000, 0, 0)).toBe(200_000);
  });

  it("todos en cero — retorna cero", () => {
    expect(tuCajaDelDiaFormula(0, 0, 0, 0)).toBe(0);
  });

  it("gastos y préstamos mayores a cobros — puede ser negativo", () => {
    expect(tuCajaDelDiaFormula(0, 100_000, 60_000, 80_000)).toBe(-40_000);
  });
});

describe("tuCajaEfectivoFormula (línea 51)", () => {
  it("solo efectivo — excluye transferencias implícitamente", () => {
    expect(
      tuCajaEfectivoFormula(
        100_000, // cobros efectivo
        200_000, // base
        10_000, // gastos
        50_000 // préstamos
      )
    ).toBe(240_000);
  });
});

describe("tuCajaDelDiaDesdeTotales (línea 51)", () => {
  it("calcula desde objeto de totales", () => {
    expect(
      tuCajaDelDiaDesdeTotales({
        totalCobrosLista: 120_000,
        totalBaseAsignadaDia: 282_000,
        totalGastosDia: 2_000,
        totalPrestamosDesembolsoDia: 100_000,
      })
    ).toBe(300_000);
  });

  it("sin operaciones — retorna la base", () => {
    expect(
      tuCajaDelDiaDesdeTotales({
        totalCobrosLista: 0,
        totalBaseAsignadaDia: 200_000,
        totalGastosDia: 0,
        totalPrestamosDesembolsoDia: 0,
      })
    ).toBe(200_000);
  });

  it("todos en cero — retorna cero", () => {
    expect(
      tuCajaDelDiaDesdeTotales({
        totalCobrosLista: 0,
        totalBaseAsignadaDia: 0,
        totalGastosDia: 0,
        totalPrestamosDesembolsoDia: 0,
      })
    ).toBe(0);
  });
});
