import {
  AVISO_ACCESO_THROTTLE_MS,
  debeMostrarAvisoAccesoHasta,
  debeMostrarAvisoPorDiasRestantes,
  esRolAvisoAcceso,
  resolverEmpresaIdParaAcceso,
} from "@/lib/aviso-acceso-vencimiento";

describe("aviso-acceso-vencimiento", () => {
  it("roles elegibles: jefe, admin y adminEmpresa", () => {
    expect(esRolAvisoAcceso("jefe")).toBe(true);
    expect(esRolAvisoAcceso("admin")).toBe(true);
    expect(esRolAvisoAcceso("adminEmpresa")).toBe(true);
    expect(esRolAvisoAcceso("trabajador")).toBe(false);
    expect(esRolAvisoAcceso("superAdmin")).toBe(false);
  });

  it("ventana de aviso: solo 1 o 2 días restantes", () => {
    expect(debeMostrarAvisoPorDiasRestantes(2)).toBe(true);
    expect(debeMostrarAvisoPorDiasRestantes(1)).toBe(true);
    expect(debeMostrarAvisoPorDiasRestantes(0)).toBe(false);
    expect(debeMostrarAvisoPorDiasRestantes(3)).toBe(false);
    expect(debeMostrarAvisoPorDiasRestantes(null)).toBe(false);
  });

  it("corte el 23 → aviso el 21 y 22, no el 23", () => {
    const corte = "2026-07-23";
    expect(debeMostrarAvisoAccesoHasta(corte, "2026-07-21")).toBe(true);
    expect(debeMostrarAvisoAccesoHasta(corte, "2026-07-22")).toBe(true);
    expect(debeMostrarAvisoAccesoHasta(corte, "2026-07-23")).toBe(false);
    expect(debeMostrarAvisoAccesoHasta(corte, "2026-07-20")).toBe(false);
  });

  it("throttle constante es 4 horas", () => {
    expect(AVISO_ACCESO_THROTTLE_MS).toBe(4 * 60 * 60 * 1000);
  });

  it("resolverEmpresaIdParaAcceso", () => {
    expect(
      resolverEmpresaIdParaAcceso({ uid: "jefe1", role: "jefe", empresaId: "jefe1" })
    ).toBe("jefe1");
    expect(resolverEmpresaIdParaAcceso({ uid: "jefe1", role: "jefe" })).toBe("jefe1");
    expect(
      resolverEmpresaIdParaAcceso({
        uid: "ae1",
        role: "adminEmpresa",
        empresaId: "ae1",
      })
    ).toBe("ae1");
    expect(
      resolverEmpresaIdParaAcceso({
        uid: "adm1",
        role: "admin",
        empresaId: "jefe1",
      })
    ).toBe("jefe1");
    expect(resolverEmpresaIdParaAcceso({ uid: "adm1", role: "admin" })).toBeNull();
  });
});
