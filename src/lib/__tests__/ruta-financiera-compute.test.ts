import {
  computeRutaCamposTrasCobroPrestamoCobroEnEmpleado,
  computeRutaCamposTrasPerdidaPrestamo,
  splitMontoPagoEnCapitalYGanancia,
  round2,
} from "@/lib/ruta-financiera-compute";

describe("splitMontoPagoEnCapitalYGanancia", () => {
  it("divide correctamente con interés del 20%", () => {
    const { capital, ganancia } = splitMontoPagoEnCapitalYGanancia(
      100_000, // monto pago
      500_000, // monto préstamo
      600_000 // totalAPagar (20% interés)
    );
    expect(capital).toBeCloseTo(83_333.33, 0);
    expect(ganancia).toBeCloseTo(16_666.67, 0);
    expect(capital + ganancia).toBeCloseTo(100_000, 0);
  });

  it("sin interés — todo es capital", () => {
    const { capital, ganancia } = splitMontoPagoEnCapitalYGanancia(
      100_000,
      500_000,
      500_000 // sin interés
    );
    expect(capital).toBe(100_000);
    expect(ganancia).toBe(0);
  });

  it("no genera valores negativos", () => {
    const { capital, ganancia } = splitMontoPagoEnCapitalYGanancia(0, 500_000, 600_000);
    expect(capital).toBeGreaterThanOrEqual(0);
    expect(ganancia).toBeGreaterThanOrEqual(0);
  });
});

describe("computeRutaCamposTrasCobroPrestamoCobroEnEmpleado", () => {
  const rutaBase = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 800_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 2_300_000,
  };

  it("capital total sube solo por la ganancia (interés en caja empleado)", () => {
    const { ganancia } = splitMontoPagoEnCapitalYGanancia(100_000, 500_000, 600_000);
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    const nuevoCapital = result.cajaRuta + result.cajasEmpleados + result.inversiones;
    expect(round2(nuevoCapital)).toBeCloseTo(2_300_000 + ganancia, 0);
    expect(result.capitalTotal).toBe(round2(nuevoCapital));
  });

  it("inversiones bajan en la parte capital del pago", () => {
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.inversiones).toBeLessThan(rutaBase.inversiones);
  });

  it("ganancias suben en la parte interés del pago", () => {
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.ganancias).toBeGreaterThan(rutaBase.ganancias);
  });

  it("caja empleado sube el monto cobrado", () => {
    const result = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaBase,
      100_000,
      500_000,
      600_000
    );
    expect(result.montoAcreditarCajaEmpleado).toBe(100_000);
  });
});

describe("computeRutaCamposTrasPerdidaPrestamo", () => {
  const rutaBase = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 800_000,
    ganancias: 50_000,
    perdidas: 0,
    capitalTotal: 2_300_000,
  };

  it("inversiones bajan el monto completo de la pérdida", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      175_000,
      500_000,
      600_000
    );
    expect(result.inversiones).toBe(625_000); // 800k - 175k
  });

  it("pérdidas informativas suben", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      175_000,
      500_000,
      600_000
    );
    expect(result.perdidas).toBe(175_000);
  });

  it("capital total baja exactamente el monto de la pérdida", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      175_000,
      500_000,
      600_000
    );
    const nuevoCapital = rutaBase.cajaRuta + rutaBase.cajasEmpleados + result.inversiones;
    expect(round2(nuevoCapital)).toBeCloseTo(2_125_000, 0);
  });

  it("no descuenta más de las inversiones disponibles", () => {
    const result = computeRutaCamposTrasPerdidaPrestamo(
      rutaBase,
      999_999_999,
      500_000,
      600_000 // monto absurdo
    );
    expect(result.inversiones).toBeGreaterThanOrEqual(0);
  });
});
