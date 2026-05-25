import { tuCajaEfectivoFormula } from "@/lib/tu-caja-del-dia";

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
