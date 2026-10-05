import {
  aplicarDeltaJornada,
  cuotaARecogerDelPrestamo,
  jornadaDiaDocId,
  resumirJornadaDia,
  type PagoJornadaInput,
  type PrestamoJornadaInput,
} from "@/lib/jornada-dia";

const FECHA = "2026-10-05";

function prestamo(partial: Partial<PrestamoJornadaInput> & Pick<PrestamoJornadaInput, "id">): PrestamoJornadaInput {
  return {
    saldoPendiente: 50_000,
    totalAPagar: 100_000,
    numeroCuotas: 10,
    adelantoCuota: 0,
    diaAlta: "2026-10-01",
    ...partial,
  };
}

describe("cuotaARecogerDelPrestamo", () => {
  it("toma una cuota cuando el saldo cubre más de una", () => {
    expect(
      cuotaARecogerDelPrestamo({
        saldoPendiente: 50_000,
        totalAPagar: 100_000,
        numeroCuotas: 10,
        adelantoCuota: 0,
      })
    ).toBe(10_000);
  });

  it("descuenta el adelanto de la próxima cuota", () => {
    expect(
      cuotaARecogerDelPrestamo({
        saldoPendiente: 50_000,
        totalAPagar: 100_000,
        numeroCuotas: 10,
        adelantoCuota: 3_000,
      })
    ).toBe(7_000);
  });

  it("si el saldo es menor que la cuota, cobra el saldo", () => {
    expect(
      cuotaARecogerDelPrestamo({
        saldoPendiente: 4_000,
        totalAPagar: 100_000,
        numeroCuotas: 10,
        adelantoCuota: 0,
      })
    ).toBe(4_000);
  });
});

describe("resumirJornadaDia", () => {
  it("suma las cuotas del día y deja lo recogido en cero si nadie ha pagado", () => {
    const resumen = resumirJornadaDia(
      [prestamo({ id: "p1" }), prestamo({ id: "p2", saldoPendiente: 8_000 })],
      [],
      FECHA
    );
    expect(resumen).toEqual({
      montoARecoger: 18_000,
      montoRecogido: 0,
      montoRestante: 18_000,
    });
  });

  it("no mete en el estimado un préstamo desembolsado hoy", () => {
    const resumen = resumirJornadaDia(
      [prestamo({ id: "p1" }), prestamo({ id: "nuevo", diaAlta: FECHA })],
      [],
      FECHA
    );
    expect(resumen.montoARecoger).toBe(10_000);
  });

  it("reconstruye la cuota de la mañana aunque ya haya un abono parcial", () => {
    const pagos: PagoJornadaInput[] = [
      {
        prestamoId: "p1",
        monto: 4_000,
        tipo: "pago",
        anulado: false,
        fechaMs: 1,
        saldoPendienteAntes: 50_000,
        adelantoCuotaAntes: 0,
      },
    ];
    const resumen = resumirJornadaDia(
      [prestamo({ id: "p1", saldoPendiente: 46_000, adelantoCuota: 4_000 })],
      pagos,
      FECHA
    );
    expect(resumen).toEqual({
      montoARecoger: 10_000,
      montoRecogido: 4_000,
      montoRestante: 6_000,
    });
  });

  it("incluye la cuota de un préstamo que se pagó completo hoy", () => {
    const pagos: PagoJornadaInput[] = [
      {
        prestamoId: "p1",
        monto: 8_000,
        tipo: "pago",
        anulado: false,
        fechaMs: 1,
        saldoPendienteAntes: 8_000,
        adelantoCuotaAntes: 0,
      },
    ];
    const resumen = resumirJornadaDia(
      [prestamo({ id: "p1", saldoPendiente: 0 })],
      pagos,
      FECHA
    );
    expect(resumen).toEqual({
      montoARecoger: 8_000,
      montoRecogido: 8_000,
      montoRestante: 0,
    });
  });

  it("ignora cobros anulados y no deja el restante en negativo", () => {
    const resumen = resumirJornadaDia(
      [prestamo({ id: "p1" })],
      [
        {
          prestamoId: "p1",
          monto: 30_000,
          tipo: "pago",
          anulado: false,
          fechaMs: 1,
          saldoPendienteAntes: 50_000,
          adelantoCuotaAntes: 0,
        },
        {
          prestamoId: "p1",
          monto: 10_000,
          tipo: "pago",
          anulado: true,
          fechaMs: 2,
        },
      ],
      FECHA
    );
    expect(resumen.montoARecoger).toBe(10_000);
    expect(resumen.montoRecogido).toBe(30_000);
    expect(resumen.montoRestante).toBe(0);
  });
});

describe("aplicarDeltaJornada", () => {
  it("descuenta un cobro y repone al anular", () => {
    const base = { montoARecoger: 10_000, montoRecogido: 0, montoRestante: 10_000 };
    const trasCobro = aplicarDeltaJornada(base, 4_000);
    expect(trasCobro).toEqual({
      montoARecoger: 10_000,
      montoRecogido: 4_000,
      montoRestante: 6_000,
    });
    expect(aplicarDeltaJornada(trasCobro, -4_000)).toEqual(base);
  });
});

describe("jornadaDiaDocId", () => {
  it("arma la clave del día y la ruta", () => {
    expect(jornadaDiaDocId("2026-10-05", "ruta1")).toBe("2026-10-05_ruta1");
  });
});
