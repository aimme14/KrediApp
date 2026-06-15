import {
  UMBRAL_INTENTOS_ALERTA,
  calcularDiasVencidos,
  calcularPrioridadCobro,
  tieneAlertaAlta,
  tieneAlertaNoPagoInformativa,
} from "@/lib/ruta-dia-prioridad";

describe("ruta-dia-prioridad", () => {
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  it("calcula días vencidos por fecha", () => {
    expect(calcularDiasVencidos(ayer)).toBeGreaterThanOrEqual(1);
    expect(calcularDiasVencidos(manana)).toBe(0);
    expect(calcularDiasVencidos(null)).toBe(0);
  });

  it("prioridad 1 por intentos fallidos altos", () => {
    expect(calcularPrioridadCobro(manana, UMBRAL_INTENTOS_ALERTA)).toBe(1);
    expect(calcularPrioridadCobro(null, 5)).toBe(1);
  });

  it("prioridad 2 por alerta informativa de no pago", () => {
    expect(calcularPrioridadCobro(manana, 1)).toBe(2);
    expect(calcularPrioridadCobro(manana, 2)).toBe(2);
  });

  it("prioridad 3 si vence hoy o está vencido", () => {
    expect(calcularPrioridadCobro(hoy, 0)).toBe(3);
    expect(calcularPrioridadCobro(ayer, 0)).toBe(3);
  });

  it("helpers de alerta", () => {
    expect(tieneAlertaAlta(3)).toBe(true);
    expect(tieneAlertaAlta(2)).toBe(false);
    expect(tieneAlertaNoPagoInformativa(2)).toBe(true);
    expect(tieneAlertaNoPagoInformativa(3)).toBe(false);
  });
});
