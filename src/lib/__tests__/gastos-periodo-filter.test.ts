import {
  esGastoDelDiaColombia,
  filtrarGastosPorPeriodo,
} from "@/lib/gastos-periodo-filter";
import { inicioDiaColombiaUtc } from "@/lib/colombia-day-bounds";

const HOY = "2026-06-08";
const AYER = "2026-06-07";

describe("esGastoDelDiaColombia", () => {
  it("acepta gasto con inicio de día en Colombia (formato nuevo)", () => {
    const iso = inicioDiaColombiaUtc(HOY)!.toISOString();
    expect(esGastoDelDiaColombia(iso, HOY)).toBe(true);
  });

  it("rechaza gasto de otro día calendario", () => {
    const iso = inicioDiaColombiaUtc(AYER)!.toISOString();
    expect(esGastoDelDiaColombia(iso, HOY)).toBe(false);
  });

  it("acepta legado medianoche UTC de solo-fecha", () => {
    expect(esGastoDelDiaColombia("2026-06-08T00:00:00.000Z", HOY)).toBe(true);
    expect(esGastoDelDiaColombia("2026-06-07T00:00:00.000Z", HOY)).toBe(false);
  });

  it("fecha nula o inválida no cuenta como hoy", () => {
    expect(esGastoDelDiaColombia(null, HOY)).toBe(false);
    expect(esGastoDelDiaColombia(undefined, HOY)).toBe(false);
    expect(esGastoDelDiaColombia("invalid", HOY)).toBe(false);
  });
});

describe("filtrarGastosPorPeriodo", () => {
  const gastos = [
    { id: "a", fecha: inicioDiaColombiaUtc(HOY)!.toISOString() },
    { id: "b", fecha: inicioDiaColombiaUtc(AYER)!.toISOString() },
    { id: "c", fecha: null },
  ];

  it("vista hoy — solo gastos del día", () => {
    const out = filtrarGastosPorPeriodo(gastos, "hoy", HOY);
    expect(out.map((g) => g.id)).toEqual(["a"]);
  });

  it("vista historial — excluye gastos de hoy", () => {
    const out = filtrarGastosPorPeriodo(gastos, "historial", HOY);
    expect(out.map((g) => g.id)).toEqual(["b", "c"]);
  });
});
