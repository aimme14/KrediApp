import {
  ESTADO_PRESTAMO_ABIERTO,
  estadoTrasNoPago,
  isPrestamoCastigado,
  isPrestamoCerrado,
  isPrestamoEnCobro,
  labelEstadoPrestamo,
  normalizeEstadoPrestamo,
  resolverEstadoTrasMovimiento,
} from "@/lib/prestamo-estado";

describe("normalizeEstadoPrestamo", () => {
  it("normaliza estados abiertos a activo", () => {
    expect(normalizeEstadoPrestamo("activo")).toBe("activo");
    expect(normalizeEstadoPrestamo(undefined)).toBe("activo");
    expect(normalizeEstadoPrestamo("desconocido")).toBe("activo");
  });

  it("conserva pagado y castigado", () => {
    expect(normalizeEstadoPrestamo("pagado")).toBe("pagado");
    expect(normalizeEstadoPrestamo("castigado")).toBe("castigado");
  });
});

describe("isPrestamoEnCobro", () => {
  it("requiere activo y saldo positivo", () => {
    expect(isPrestamoEnCobro({ estado: "activo", saldoPendiente: 100 })).toBe(true);
    expect(isPrestamoEnCobro({ estado: "activo", saldoPendiente: 0 })).toBe(false);
    expect(isPrestamoEnCobro({ estado: "pagado", saldoPendiente: 100 })).toBe(false);
    expect(isPrestamoEnCobro({ estado: "castigado", saldoPendiente: 0 })).toBe(false);
  });
});

describe("isPrestamoCerrado / isPrestamoCastigado", () => {
  it("detecta cierres", () => {
    expect(isPrestamoCerrado({ estado: "pagado" })).toBe(true);
    expect(isPrestamoCerrado({ estado: "castigado" })).toBe(true);
    expect(isPrestamoCerrado({ estado: "activo" })).toBe(false);
    expect(isPrestamoCastigado({ estado: "castigado" })).toBe(true);
    expect(isPrestamoCastigado({ estado: "pagado" })).toBe(false);
  });
});

describe("labelEstadoPrestamo", () => {
  it("etiqueta según estado y pérdida parcial", () => {
    expect(labelEstadoPrestamo({ estado: "activo" })).toBe("Activo");
    expect(labelEstadoPrestamo({ estado: "activo", totalCastigado: 50_000 })).toBe(
      "Activo (con pérdida parcial)"
    );
    expect(labelEstadoPrestamo({ estado: "pagado" })).toBe("Pagado");
    expect(labelEstadoPrestamo({ estado: "castigado" })).toBe("Pérdida");
  });
});

describe("resolverEstadoTrasMovimiento", () => {
  it("mantiene activo si queda saldo", () => {
    expect(resolverEstadoTrasMovimiento({ tipo: "pago", nuevoSaldo: 1 })).toEqual({
      estado: "activo",
      cierraPrestamo: false,
    });
    expect(resolverEstadoTrasMovimiento({ tipo: "perdida", nuevoSaldo: 50_000 })).toEqual({
      estado: "activo",
      cierraPrestamo: false,
    });
  });

  it("cierra en pagado por cobro", () => {
    expect(resolverEstadoTrasMovimiento({ tipo: "pago", nuevoSaldo: 0 })).toEqual({
      estado: "pagado",
      cerradoPor: "cobro",
      cierraPrestamo: true,
    });
  });

  it("cierra en castigado por pérdida", () => {
    expect(resolverEstadoTrasMovimiento({ tipo: "perdida", nuevoSaldo: 0 })).toEqual({
      estado: "castigado",
      cerradoPor: "castigo",
      cierraPrestamo: true,
    });
  });
});

describe("estadoTrasNoPago", () => {
  it("preserva cierres y reactiva solo préstamos abiertos", () => {
    expect(estadoTrasNoPago("pagado")).toBe("pagado");
    expect(estadoTrasNoPago("castigado")).toBe("castigado");
    expect(estadoTrasNoPago("activo")).toBe("activo");
    expect(estadoTrasNoPago(undefined)).toBe("activo");
  });
});

describe("constante de estado abierto", () => {
  it("expone activo", () => {
    expect(ESTADO_PRESTAMO_ABIERTO).toBe("activo");
  });
});
