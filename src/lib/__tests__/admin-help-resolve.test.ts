import { resolveAdminHelpPageKey } from "@/content/help/admin/resolve";

describe("resolveAdminHelpPageKey", () => {
  it("resuelve inicio del admin", () => {
    expect(resolveAdminHelpPageKey("/dashboard/admin")).toBe("inicio");
  });

  it("resuelve rutas específicas antes que el prefijo general", () => {
    expect(resolveAdminHelpPageKey("/dashboard/admin/solicitudes-prestamo")).toBe("solicitudes-prestamo");
    expect(resolveAdminHelpPageKey("/dashboard/admin/gestion-financiera")).toBe("gestion-financiera");
    expect(resolveAdminHelpPageKey("/dashboard/admin/cliente-moroso")).toBe("cliente-moroso");
    expect(resolveAdminHelpPageKey("/dashboard/admin/pagos-diarios")).toBe("pagos-diarios");
    expect(resolveAdminHelpPageKey("/dashboard/admin/cliente")).toBe("cliente");
  });

  it("resuelve subrutas con el mismo contenido de la sección padre", () => {
    expect(resolveAdminHelpPageKey("/dashboard/admin/prestamo/extra")).toBe("prestamo");
  });

  it("usa inicio como fallback fuera del panel admin", () => {
    expect(resolveAdminHelpPageKey("/dashboard/jefe/inicio")).toBe("inicio");
  });
});
