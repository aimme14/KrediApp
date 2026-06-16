import {
  calcularTotalesGastosPorAlcance,
  esGastoDelDiaColombia,
  filtrarGastosPorFiltroContable,
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

describe("filtro contable admin", () => {
  const periodos = [
    {
      id: "p2",
      estado: "abierto" as const,
      fechaApertura: "2026-06-08T13:00:00.000Z",
      fechaCierre: null,
      abiertoPorUid: "a1",
      cerradoPorUid: null,
    },
    {
      id: "p1",
      estado: "cerrado" as const,
      fechaApertura: "2026-06-01T13:00:00.000Z",
      fechaCierre: "2026-06-07T23:59:59.000Z",
      abiertoPorUid: "a1",
      cerradoPorUid: "a1",
    },
  ];

  const gastos = [
    { id: "en-actual", fecha: "2026-06-09T15:00:00.000Z", monto: 100, alcance: "admin" },
    { id: "en-cerrado", fecha: "2026-06-05T15:00:00.000Z", monto: 50, alcance: "ruta" },
    { id: "fuera", fecha: "2026-05-20T15:00:00.000Z", monto: 20, alcance: "empleado" },
  ];

  it("filtra periodo actual abierto", () => {
    const out = filtrarGastosPorFiltroContable(
      gastos,
      { modo: "actual" },
      periodos,
      new Date("2026-06-10T12:00:00.000Z")
    );
    expect(out.map((g) => g.id)).toEqual(["en-actual"]);
  });

  it("filtra periodo cerrado por id", () => {
    const out = filtrarGastosPorFiltroContable(gastos, { modo: "cerrado", periodoId: "p1" }, periodos);
    expect(out.map((g) => g.id)).toEqual(["en-cerrado"]);
  });

  it("modo todo devuelve todos", () => {
    const out = filtrarGastosPorFiltroContable(gastos, { modo: "todo" }, periodos);
    expect(out).toHaveLength(3);
  });

  it("filtra solo gastos de hoy (Colombia)", () => {
    const hoy = "2026-06-09";
    const gastosConHoy = [
      { id: "hoy", fecha: inicioDiaColombiaUtc(hoy)!.toISOString(), monto: 30, alcance: "admin" },
      { id: "ayer", fecha: inicioDiaColombiaUtc("2026-06-08")!.toISOString(), monto: 10, alcance: "admin" },
    ];
    const out = filtrarGastosPorFiltroContable(
      gastosConHoy,
      { modo: "hoy" },
      periodos,
      new Date("2026-06-09T20:00:00.000Z"),
      "2026-06-09"
    );
    expect(out.map((g) => g.id)).toEqual(["hoy"]);
  });

  it("calcula totales por alcance", () => {
    const tot = calcularTotalesGastosPorAlcance(gastos);
    expect(tot).toEqual({ admin: 100, ruta: 50, empleado: 20, total: 170 });
  });
});
