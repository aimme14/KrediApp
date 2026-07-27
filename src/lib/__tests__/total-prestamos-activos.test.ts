import {
  contarPrestamosActivosDeAdmin,
  deltaTotalPrestamosActivosAlEliminar,
  deltaTotalPrestamosActivosPorCambioEstado,
} from "@/lib/total-prestamos-activos";

describe("deltaTotalPrestamosActivosPorCambioEstado", () => {
  it("cierra activo → pagado: -1", () => {
    expect(
      deltaTotalPrestamosActivosPorCambioEstado({
        estadoAntes: "activo",
        estadoDespues: "pagado",
      })
    ).toBe(-1);
  });

  it("cierra activo → castigado: -1", () => {
    expect(
      deltaTotalPrestamosActivosPorCambioEstado({
        estadoAntes: "activo",
        estadoDespues: "castigado",
      })
    ).toBe(-1);
  });

  it("reabre pagado → activo: +1", () => {
    expect(
      deltaTotalPrestamosActivosPorCambioEstado({
        estadoAntes: "pagado",
        estadoDespues: "activo",
      })
    ).toBe(1);
  });

  it("pago parcial activo → activo: 0", () => {
    expect(
      deltaTotalPrestamosActivosPorCambioEstado({
        estadoAntes: "activo",
        estadoDespues: "activo",
      })
    ).toBe(0);
  });

  it("ya cerrado → cerrado: 0 (evita doble decremento)", () => {
    expect(
      deltaTotalPrestamosActivosPorCambioEstado({
        estadoAntes: "pagado",
        estadoDespues: "pagado",
      })
    ).toBe(0);
    expect(
      deltaTotalPrestamosActivosPorCambioEstado({
        estadoAntes: "castigado",
        estadoDespues: "pagado",
      })
    ).toBe(0);
  });
});

describe("deltaTotalPrestamosActivosAlEliminar", () => {
  it("elimina activo: -1", () => {
    expect(deltaTotalPrestamosActivosAlEliminar("activo")).toBe(-1);
  });

  it("elimina ya cerrado: 0", () => {
    expect(deltaTotalPrestamosActivosAlEliminar("pagado")).toBe(0);
    expect(deltaTotalPrestamosActivosAlEliminar("castigado")).toBe(0);
  });
});

describe("contarPrestamosActivosDeAdmin", () => {
  const lista = [
    { adminId: "a1", estado: "activo", saldoPendiente: 100 },
    { adminId: "a1", estado: "activo", saldoPendiente: 0 },
    { adminId: "a1", estado: "pagado", saldoPendiente: 0 },
    { adminId: "a1", estado: "castigado", saldoPendiente: 0 },
    { adminId: "a2", estado: "activo", saldoPendiente: 50 },
    { adminId: "a1", estado: "activo", saldoPendiente: 1 },
  ];

  it("cuenta solo en cobro del admin", () => {
    expect(contarPrestamosActivosDeAdmin(lista, "a1")).toBe(2);
    expect(contarPrestamosActivosDeAdmin(lista, "a2")).toBe(1);
    expect(contarPrestamosActivosDeAdmin(lista, "a3")).toBe(0);
  });
});
