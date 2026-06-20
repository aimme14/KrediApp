import { inicioDiaColombiaUtc } from "@/lib/colombia-day-bounds";
import { esPrestamoCreadoHoy } from "@/lib/prestamo-display";
import {
  filtrarPrestamosPorFiltroContable,
  mensajePrestamosVaciosContable,
  prestamoOcurreEnFiltroContable,
} from "@/lib/prestamo-periodo-filter";

describe("esPrestamoCreadoHoy", () => {
  it("usa calendario Colombia", () => {
    const hoy = "2026-06-09";
    const iso = inicioDiaColombiaUtc(hoy)!.toISOString();
    expect(esPrestamoCreadoHoy({ creadoEn: iso }, hoy)).toBe(true);
    expect(esPrestamoCreadoHoy({ fechaInicio: "2026-06-08" }, hoy)).toBe(false);
  });
});

describe("prestamo-periodo-filter", () => {
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

  const prestamos = [
    { id: "a", creadoEn: "2026-06-09T15:00:00.000Z", monto: 100 },
    { id: "b", creadoEn: "2026-06-05T15:00:00.000Z", monto: 50 },
    { id: "c", fechaInicio: "2026-05-20", monto: 20 },
  ];

  it("filtra hoy", () => {
    const out = filtrarPrestamosPorFiltroContable(
      prestamos,
      { modo: "hoy" },
      periodos,
      new Date("2026-06-09T20:00:00.000Z"),
      "2026-06-09"
    );
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("filtra periodo actual", () => {
    const out = filtrarPrestamosPorFiltroContable(
      prestamos,
      { modo: "actual" },
      periodos,
      new Date("2026-06-10T12:00:00.000Z")
    );
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("prestamoOcurreEnFiltroContable respeta todo", () => {
    expect(
      prestamoOcurreEnFiltroContable(prestamos[2], { modo: "todo" }, periodos)
    ).toBe(true);
  });

  it("mensaje vacío para hoy", () => {
    expect(
      mensajePrestamosVaciosContable({ modo: "hoy" }, periodos, "todos", false, false)
    ).toBe("No hay préstamos desembolsados hoy.");
  });

  it("mensaje vacío para pérdidas", () => {
    expect(
      mensajePrestamosVaciosContable({ modo: "todo" }, periodos, "castigado", false, false)
    ).toBe("No hay préstamos en pérdida con los filtros actuales.");
  });
});
