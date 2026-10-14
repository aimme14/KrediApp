import {
  validarElegibilidadAnulacion,
  validarCoherenciaPrestamoConPago,
  determinarModoReversion,
  calcularReversion,
  saldoPendienteTrasAnulacion,
  resolverImpactoReversionPago,
  cobroBloqueadoPorReporteAceptado,
  esCobroDeTrabajador,
  mapRangoReporteAceptado,
  type DatosPago,
  type DatosPrestamo,
  type DatosRuta,
  type RangoReporteAceptado,
} from "../anular-pago-prestamo";
import {
  computeRutaCamposTrasCobroPrestamo,
  computeRutaCamposTrasCobroPrestamoCobroEnEmpleado,
  round2,
} from "../ruta-financiera-compute";

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
        enPeriodoCerrado: false,
        reporteAprobado: false,
      })
    ).toBeNull();
  });

  it("rechaza pago ya anulado", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: { ...pagoBase, estado: "anulado" },
        enPeriodoCerrado: false,
        reporteAprobado: false,
      })
    ).toBe("PAGO_NO_ACTIVO");
  });

  it("rechaza no_pago", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: { ...pagoBase, tipo: "no_pago" },
        enPeriodoCerrado: false,
        reporteAprobado: false,
      })
    ).toBe("PAGO_TIPO_INVALIDO");
  });

  it("permite anular sin periodo abierto y aunque no sea el último cobro", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: pagoBase,
        enPeriodoCerrado: false,
        reporteAprobado: false,
      })
    ).toBeNull();
  });

  it("rechaza un cobro que cae en un periodo cerrado", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: pagoBase,
        enPeriodoCerrado: true,
        reporteAprobado: false,
      })
    ).toBe("PAGO_EN_PERIODO_CERRADO");
  });

  it("rechaza si el reporte ya fue aprobado", () => {
    expect(
      validarElegibilidadAnulacion({
        pago: pagoBase,
        enPeriodoCerrado: false,
        reporteAprobado: true,
      })
    ).toBe("REPORTE_APROBADO");
  });
});

describe("saldoPendienteTrasAnulacion", () => {
  it("restaura el saldo anterior cuando el cobro es el último", () => {
    expect(
      saldoPendienteTrasAnulacion({
        saldoActual: 150_000,
        pago: pagoBase,
        esUltimoPago: true,
        modo: "snapshots",
      })
    ).toBe(200_000);
  });

  it("suma solo lo descontado por ese cobro si hay cobros posteriores", () => {
    expect(
      saldoPendienteTrasAnulacion({
        saldoActual: 80_000,
        pago: pagoBase,
        esUltimoPago: false,
        modo: "snapshots",
      })
    ).toBe(130_000);
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

describe("resolverImpactoReversionPago", () => {
  it("usa campos nuevos cuando existen", () => {
    expect(
      resolverImpactoReversionPago({
        ...pagoBase,
        cuotaCapital: 40_000,
        cuotaGanancia: 10_000,
        inversionesDescontadas: 10_000,
        gananciaAplicada: 40_000,
      })
    ).toEqual({ inversionesDescontadas: 10_000, gananciaAplicada: 40_000 });
  });

  it("fallback legacy a cuotaCapital/cuotaGanancia", () => {
    expect(resolverImpactoReversionPago(pagoBase)).toEqual({
      inversionesDescontadas: 40_000,
      gananciaAplicada: 10_000,
    });
  });
});

describe("calcularReversion — capital no registrado (ida y vuelta)", () => {
  const rutaPobre: DatosRuta = {
    cajaRuta: 1_000_000,
    cajasEmpleados: 500_000,
    inversiones: 10_000,
    ganancias: 50_000,
    perdidas: 0,
  };

  it("cobro admin + anulación restaura saldos de ruta", () => {
    const monto = 100_000;
    const montoPrestamo = 500_000;
    const totalAPagar = 600_000;
    const cobro = computeRutaCamposTrasCobroPrestamo(
      rutaPobre,
      monto,
      montoPrestamo,
      totalAPagar
    );
    const { capital, ganancia } = (() => {
      const ratio = montoPrestamo / totalAPagar;
      const c = round2(monto * ratio);
      return { capital: c, ganancia: round2(monto - c) };
    })();

    const rutaTrasCobro: DatosRuta = {
      ...rutaPobre,
      cajaRuta: cobro.cajaRuta,
      inversiones: cobro.inversiones,
      ganancias: cobro.ganancias,
    };

    const pago: DatosPago = {
      ...pagoBase,
      monto,
      cuotaCapital: capital,
      cuotaGanancia: ganancia,
      inversionesDescontadas: cobro.inversionesDescontadas,
      gananciaAplicada: cobro.gananciaAplicada,
      acreditaCajaRuta: true,
      saldoPendienteAntes: 200_000,
      saldoPendienteDespues: 100_000,
    };

    const rev = calcularReversion({
      pago,
      prestamo: { ...prestamoBase, saldoPendiente: 100_000 },
      ruta: rutaTrasCobro,
      empleado: null,
      modo: "snapshots",
    });

    expect(rev.nuevaCajaRuta).toBe(rutaPobre.cajaRuta);
    expect(rev.nuevasInversiones).toBe(rutaPobre.inversiones);
    expect(rev.nuevasGanancias).toBe(rutaPobre.ganancias);
  });

  it("cobro empleado + anulación restaura saldos de ruta", () => {
    const monto = 100_000;
    const montoPrestamo = 500_000;
    const totalAPagar = 600_000;
    const cobro = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
      rutaPobre,
      monto,
      montoPrestamo,
      totalAPagar
    );
    const ratio = montoPrestamo / totalAPagar;
    const capital = round2(monto * ratio);
    const ganancia = round2(monto - capital);

    const rutaTrasCobro: DatosRuta = {
      ...rutaPobre,
      cajasEmpleados: cobro.cajasEmpleados,
      inversiones: cobro.inversiones,
      ganancias: cobro.ganancias,
    };

    const pago: DatosPago = {
      ...pagoBase,
      monto,
      cuotaCapital: capital,
      cuotaGanancia: ganancia,
      inversionesDescontadas: cobro.inversionesDescontadas,
      gananciaAplicada: cobro.gananciaAplicada,
      acreditaCajaRuta: false,
      saldoPendienteAntes: 200_000,
      saldoPendienteDespues: 100_000,
    };

    const rev = calcularReversion({
      pago,
      prestamo: { ...prestamoBase, saldoPendiente: 100_000 },
      ruta: rutaTrasCobro,
      empleado: { cajaEmpleado: 300_000 + monto },
      modo: "snapshots",
    });

    expect(rev.nuevosCajasEmpleados).toBe(rutaPobre.cajasEmpleados);
    expect(rev.nuevasInversiones).toBe(rutaPobre.inversiones);
    expect(rev.nuevasGanancias).toBe(rutaPobre.ganancias);
    expect(rev.nuevaCajaEmpleado).toBe(300_000);
  });

  it("pago legacy sin impacto: sigue usando cuotaCapital/cuotaGanancia", () => {
    const rev = calcularReversion({
      pago: { ...pagoBase, acreditaCajaRuta: true },
      prestamo: prestamoBase,
      ruta: rutaBase,
      empleado: null,
      modo: "snapshots",
    });
    expect(rev.nuevaCajaRuta).toBe(450_000);
    expect(rev.nuevasInversiones).toBe(840_000);
    expect(rev.nuevasGanancias).toBe(40_000);
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

const reporteAceptado: RangoReporteAceptado = {
  empleadoId: "emp-1",
  rutaId: "ruta-1",
  fechaDesde: new Date("2026-10-01T05:00:00.000Z"),
  fechaHasta: new Date("2026-10-03T20:00:00.000Z"),
  fechaDia: "2026-10-03",
};

describe("cobro bloqueado por reporte aceptado", () => {
  const dentro = new Date("2026-10-02T18:00:00.000Z");

  it("bloquea efectivo y transferencia del trabajador si el cobro cae en el periodo aceptado", () => {
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "empleado",
        empleadoId: "emp-1",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: dentro,
        reportes: [reporteAceptado],
      })
    ).toBe(true);
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "trabajador",
        empleadoId: "emp-1",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: dentro,
        reportes: [reporteAceptado],
      })
    ).toBe(true);
  });

  it("deja anular si el reporte sigue sin aceptarse", () => {
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "empleado",
        empleadoId: "emp-1",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: dentro,
        reportes: [],
      })
    ).toBe(false);
  });

  it("deja anular un cobro del trabajador fuera del periodo aceptado", () => {
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "empleado",
        empleadoId: "emp-1",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: new Date("2026-10-04T15:00:00.000Z"),
        reportes: [reporteAceptado],
      })
    ).toBe(false);
  });

  it("no bloquea cobros del administrador aunque exista un reporte del trabajador", () => {
    expect(esCobroDeTrabajador({ cobradoPorRol: "admin", empleadoId: "admin-1", adminUid: "admin-1" })).toBe(
      false
    );
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "admin",
        empleadoId: "admin-1",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: dentro,
        reportes: [reporteAceptado],
      })
    ).toBe(false);
  });

  it("ignora el reporte de otro trabajador o de otra ruta", () => {
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "empleado",
        empleadoId: "emp-2",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: dentro,
        reportes: [reporteAceptado],
      })
    ).toBe(false);
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "empleado",
        empleadoId: "emp-1",
        rutaId: "ruta-2",
        adminUid: "admin-1",
        fechaPago: dentro,
        reportes: [reporteAceptado],
      })
    ).toBe(false);
  });

  it("trata como trabajador un cobro legacy cuyo empleado no es el admin", () => {
    expect(
      esCobroDeTrabajador({ cobradoPorRol: null, empleadoId: "emp-1", adminUid: "admin-1" })
    ).toBe(true);
    expect(
      esCobroDeTrabajador({ cobradoPorRol: null, empleadoId: "admin-1", adminUid: "admin-1" })
    ).toBe(false);
  });

  it("en reportes viejos sin rango usa la fecha del día", () => {
    const legacy = mapRangoReporteAceptado({
      empleadoId: "emp-1",
      rutaId: "ruta-1",
      fechaDia: "2026-10-02",
    });
    expect(legacy.fechaDesde).toBeNull();
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "empleado",
        empleadoId: "emp-1",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: dentro,
        reportes: [legacy],
      })
    ).toBe(true);
  });

  it("no usa la fecha del día si el rango existe y el cobro quedó fuera", () => {
    expect(
      cobroBloqueadoPorReporteAceptado({
        cobradoPorRol: "empleado",
        empleadoId: "emp-1",
        rutaId: "ruta-1",
        adminUid: "admin-1",
        fechaPago: new Date("2026-10-03T21:00:00.000Z"),
        reportes: [{ ...reporteAceptado, fechaDia: "2026-10-03" }],
      })
    ).toBe(false);
  });
});
