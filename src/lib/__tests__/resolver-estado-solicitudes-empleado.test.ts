import { resolverEstadoSolicitudesEmpleado } from "@/lib/resolver-estado-solicitudes-empleado";

function sol(
  id: string,
  estado: "pendiente" | "aprobada" | "rechazada",
  creadaEnIso: string
) {
  return {
    id,
    estado,
    creadaEn: new Date(creadaEnIso),
    motivoRechazo: estado === "rechazada" ? `motivo-${id}` : null,
  };
}

describe("resolverEstadoSolicitudesEmpleado", () => {
  it("sin solicitudes → vacío", () => {
    expect(resolverEstadoSolicitudesEmpleado([])).toEqual({
      pendiente: null,
      ultimaRechazada: null,
      masReciente: null,
    });
  });

  it("usa la solicitud más reciente por creadaEn", () => {
    const a = sol("a", "rechazada", "2026-07-30T10:00:00.000Z");
    const b = sol("b", "pendiente", "2026-07-30T12:00:00.000Z");
    const r = resolverEstadoSolicitudesEmpleado([a, b]);
    expect(r.masReciente?.id).toBe("b");
    expect(r.pendiente?.id).toBe("b");
    expect(r.ultimaRechazada).toBeNull();
  });

  it("si la más reciente está rechazada, la muestra (no un rechazo viejo)", () => {
    const vieja = sol("vieja", "rechazada", "2026-07-30T09:00:00.000Z");
    const nueva = sol("nueva", "rechazada", "2026-07-30T14:00:00.000Z");
    const r = resolverEstadoSolicitudesEmpleado([vieja, nueva]);
    expect(r.ultimaRechazada?.id).toBe("nueva");
    expect(r.pendiente).toBeNull();
  });

  it("si la más reciente está aprobada, no muestra rechazo anterior", () => {
    const rechazo = sol("r1", "rechazada", "2026-07-30T10:00:00.000Z");
    const aprobada = sol("a1", "aprobada", "2026-07-30T15:00:00.000Z");
    const r = resolverEstadoSolicitudesEmpleado([rechazo, aprobada]);
    expect(r.masReciente?.id).toBe("a1");
    expect(r.pendiente).toBeNull();
    expect(r.ultimaRechazada).toBeNull();
  });

  it("rechazo → reenvío pendiente → aprobación: queda sin rechazo visible", () => {
    const r1 = sol("r1", "rechazada", "2026-07-30T10:00:00.000Z");
    const p2 = sol("p2", "aprobada", "2026-07-30T11:00:00.000Z");
    const r = resolverEstadoSolicitudesEmpleado([r1, p2]);
    expect(r.ultimaRechazada).toBeNull();
    expect(r.masReciente?.estado).toBe("aprobada");
  });
});
