import {
  ESTADO_PRESTAMO_ABIERTO,
  normalizeEstadoPrestamo,
} from "@/lib/prestamo-estado";

describe("prestamo-estado", () => {
  it("normaliza estados abiertos a activo", () => {
    expect(normalizeEstadoPrestamo("activo")).toBe("activo");
    expect(normalizeEstadoPrestamo(undefined)).toBe("activo");
    expect(normalizeEstadoPrestamo("desconocido")).toBe("activo");
  });

  it("conserva pagado", () => {
    expect(normalizeEstadoPrestamo("pagado")).toBe("pagado");
  });

  it("expone constante de estado abierto", () => {
    expect(ESTADO_PRESTAMO_ABIERTO).toBe("activo");
  });
});
