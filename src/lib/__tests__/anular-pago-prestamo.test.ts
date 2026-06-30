import {
  validarElegibilidadAnulacion,
  validarCoherenciaPrestamoConPago,
  determinarModoReversion,
  calcularReversion,
  type DatosPago,
  type DatosPrestamo,
  type DatosRuta,
} from "../anular-pago-prestamo";

const pagoBase: DatosPago = {
  estado: "activo",
  tipo: "pago",
  monto: 50_000,
  cuotaCapital: 40_000,
  cuotaGanancia: 10_000,
  acreditaCajaRuta: false,
  tieneSnapshotsCompletos: true,
  saldoPendienteAntes: 200_000,
  saldoPendienteDespues: 150_000,
  adelantoCuotaAntes: 0,
  adelantoCuotaDespues: 0,
  estadoPrestamoAntes: "activo",
  estadoPrestamoDespues: "activo",
  fecha: new Date(),
  empleadoId: "emp-1",
};

const prestamoBase: DatosPrestamo = {
  saldoPendiente: 150_000,
  adelantoCuota: 0,
  estado: "activo",
};

const rutaBase: DatosRuta = {
  cajaRuta: 500_000,
  cajasEmpleados: 200_000,
  inversiones: 800_000,
  ganancias: 50_000,
  perdidas: 0,
};

describe("validarElegibilidadAnulacion", () => {
  it("devuelve null si el pago es elegible", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: pagoBase,
        enPeriodoAbierto: true,
        esUltimoPago: true,
        reporteAprobado: false,
      })
    ).toBeNull();
  });

  it("rechaza pago ya anulado", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: { ...pagoBase, estado: "anulado" },
        enPeriodoAbierto: true,
        esUltimoPago: true,
        reporteAprobado: false,
      })
    ).toBe("PAGO_NO_ACTIVO");
  });

  it("rechaza no_pago", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: { ...pagoBase, tipo: "no_pago" },
        enPeriodoAbierto: true,
        esUltimoPago: true,
        reporteAprobado: false,
      })
    ).toBe("PAGO_TIPO_INVALIDO");
  });

  it("rechaza pago fuera del periodo abierto", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: pagoBase,
        enPeriodoAbierto: false,
        esUltimoPago: true,
        reporteAprobado: false,
      })
    ).toBe("PAGO_FUERA_DE_PERIODO_ABIERTO");
  });

  it("rechaza si no es el último pago", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: pagoBase,
        enPeriodoAbierto: true,
        esUltimoPago: false,
        reporteAprobado: false,
      })
    ).toBe("PAGO_NO_ES_ULTIMO");
  });

  it("rechaza si el reporte ya fue aprobado", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: pagoBase,
        enPeriodoAbierto: true,
        esUltimoPago: true,
        reporteAprobado: true,
      })
    ).toBe("REPORTE_APROBADO");
  });
});

describe("validarCoherenciaPrestamoConPago", () => {
  it("acepta saldo coherente en modo snapshots", () => {
    expect(
      validarCoherenciaPrestamoConPago(prestamoBase, pagoBase, "snapshots")
    ).toBeNull();
  });

  it("rechaza si el saldo del préstamo no coincide", () => {
    expect(
      validarCoherenciaPrestamoConPago(
        { ...prestamoBase, saldoPendiente: 100_000 },
        pagoBase,
        "snapshots"
      )
    ).toBe("PRESTAMO_DESCUADRADO");
  });
});

describe("determinarModoReversion", () => {
  it("usa snapshots cuando están completos", () => {
    expect(determinarModoReversion(pagoBase)).toBe("snapshots");
  });

  it("usa fallback cuando no hay snapshots pero sí cuotaCapital/Ganancia", () => {
    const sin: DatosPago = {
      ...pagoBase,
      tieneSnapshotsCompletos: false,
      saldoPendienteAntes: undefined,
    };
    expect(determinarModoReversion(sin)).toBe("fallback");
  });

  it("lanza si no hay información suficiente", () => {
    const sin: DatosPago = {
      ...pagoBase,
      tieneSnapshotsCompletos: false,
      saldoPendienteAntes: undefined,
      cuotaCapital: undefined as unknown as number,
      cuotaGanancia: undefined as unknown as number,
    };
    expect(() => determinarModoReversion(sin)).toThrow("SIN_SNAPSHOTS_NI_FALLBACK");
  });
});

describe("calcularReversion — acreditaCajaRuta: false (cobro empleado)", () => {
  const empleado = { cajaEmpleado: 300_000 };

  it("revierte saldo del préstamo con snapshots", () => {
    const rev = calcularReversion({
      pago: pagoBase,
      prestamo: prestamoBase,
      ruta: rutaBase,
      empleado,
      modo: "snapshots",
    });
    expect(rev.nuevoSaldoPendiente).toBe(200_000);
    expect(rev.nuevoAdelantoCuota).toBe(0);
    expect(rev.nuevoEstadoPrestamo).toBe("activo");
  });

  it("revierte cajasEmpleados e inversiones", () => {
    const rev = calcularReversion({
      pago: pagoBase,
      prestamo: prestamoBase,
      ruta: rutaBase,
      empleado,
      modo: "snapshots",
    });
    expect(rev.nuevosCajasEmpleados).toBe(150_000);
    expect(rev.nuevasInversiones).toBe(840_000);
    expect(rev.nuevasGanancias).toBe(40_000);
  });

  it("revierte caja del empleado", () => {
    const rev = calcularReversion({
      pago: pagoBase,
      prestamo: prestamoBase,
      ruta: rutaBase,
      empleado,
      modo: "snapshots",
    });
    expect(rev.nuevaCajaEmpleado).toBe(250_000);
  });

  it("modo fallback calcula saldo desde estado actual del préstamo", () => {
    const rev = calcularReversion({
      pago: pagoBase,
      prestamo: prestamoBase,
      ruta: rutaBase,
      empleado,
      modo: "fallback",
    });
    expect(rev.nuevoSaldoPendiente).toBe(200_000);
    expect(rev.modo).toBe("fallback");
  });
});

describe("calcularReversion — acreditaCajaRuta: true", () => {
  const pagoRuta: DatosPago = { ...pagoBase, acreditaCajaRuta: true };

  it("revierte cajaRuta", () => {
    const rev = calcularReversion({
      pago: pagoRuta,
      prestamo: prestamoBase,
      ruta: rutaBase,
      empleado: null,
      modo: "snapshots",
    });
    expect(rev.nuevaCajaRuta).toBe(450_000);
    expect(rev.nuevosCajasEmpleados).toBe(200_000);
    expect(rev.nuevaCajaEmpleado).toBeNull();
  });
});

describe("calcularReversion — préstamo que se había cerrado", () => {
  it("detecta reapertura cuando estado actual es pagado y antes era activo", () => {
    const pagoUltimo: DatosPago = {
      ...pagoBase,
      estadoPrestamoAntes: "activo",
      estadoPrestamoDespues: "pagado",
      saldoPendienteAntes: 50_000,
      saldoPendienteDespues: 0,
    };
    const prestamoCerrado: DatosPrestamo = {
      ...prestamoBase,
      saldoPendiente: 0,
      estado: "pagado",
    };
    const rev = calcularReversion({
      pago: pagoUltimo,
      prestamo: prestamoCerrado,
      ruta: rutaBase,
      empleado: null,
      modo: "snapshots",
    });
    expect(rev.reabrePrestamo).toBe(true);
    expect(rev.nuevoEstadoPrestamo).toBe("activo");
    expect(rev.nuevoSaldoPendiente).toBe(50_000);
  });

  it("no reabre si el estado anterior también era pagado", () => {
    const pagoDoble: DatosPago = {
      ...pagoBase,
      estadoPrestamoAntes: "pagado",
      estadoPrestamoDespues: "pagado",
      saldoPendienteAntes: 0,
    };
    const prestamoCerrado: DatosPrestamo = {
      ...prestamoBase,
      saldoPendiente: 0,
      estado: "pagado",
    };
    const rev = calcularReversion({
      pago: pagoDoble,
      prestamo: prestamoCerrado,
      ruta: rutaBase,
      empleado: null,
      modo: "snapshots",
    });
    expect(rev.reabrePrestamo).toBe(false);
  });
});
