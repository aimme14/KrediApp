import {
  buildEmpresaAccesoInfo,
  diasRestantesAccesoEmpresa,
  empresaAccesoVencido,
  normalizarAccesoHastaInput,
} from "@/lib/empresa-acceso";

describe("empresa-acceso", () => {
  const hoy = "2026-07-09";

  it("empresaAccesoVencido: false si no hay fecha", () => {
    expect(empresaAccesoVencido(null, hoy)).toBe(false);
    expect(empresaAccesoVencido("", hoy)).toBe(false);
  });

  it("empresaAccesoVencido: el día de corte ya deshabilita", () => {
    expect(empresaAccesoVencido("2026-07-09", hoy)).toBe(true);
    expect(empresaAccesoVencido("2026-07-08", hoy)).toBe(true);
    expect(empresaAccesoVencido("2026-07-10", hoy)).toBe(false);
  });

  it("diasRestantesAccesoEmpresa", () => {
    expect(diasRestantesAccesoEmpresa("2026-07-09", hoy)).toBe(0);
    expect(diasRestantesAccesoEmpresa("2026-07-10", hoy)).toBe(1);
    expect(diasRestantesAccesoEmpresa("2026-07-08", hoy)).toBe(0);
    expect(diasRestantesAccesoEmpresa(null, hoy)).toBeNull();
  });

  it("normalizarAccesoHastaInput", () => {
    expect(normalizarAccesoHastaInput("2026-12-31")).toBe("2026-12-31");
    expect(normalizarAccesoHastaInput("")).toBeNull();
    expect(normalizarAccesoHastaInput(null)).toBeNull();
    expect(normalizarAccesoHastaInput("fecha-mala")).toBeNull();
  });

  it("buildEmpresaAccesoInfo", () => {
    const info = buildEmpresaAccesoInfo(
      "emp1",
      { accesoHasta: "2026-07-10", activa: true },
      hoy
    );
    expect(info.empresaId).toBe("emp1");
    expect(info.accesoHasta).toBe("2026-07-10");
    expect(info.vencido).toBe(false);
    expect(info.diasRestantes).toBe(1);

    const hoyEsCorte = buildEmpresaAccesoInfo(
      "emp1",
      { accesoHasta: "2026-07-09", activa: true },
      hoy
    );
    expect(hoyEsCorte.vencido).toBe(true);
    expect(hoyEsCorte.diasRestantes).toBe(0);
  });
});
