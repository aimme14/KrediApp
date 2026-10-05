/**
 * Cifras de la jornada de cobro (cuotas del día).
 * Puras: el documento en Firestore es la caché; estas funciones no leen la base.
 */

export type JornadaMontos = {
  montoARecoger: number;
  montoRecogido: number;
  montoRestante: number;
};

export type PrestamoJornadaInput = {
  id: string;
  saldoPendiente: number;
  totalAPagar: number;
  numeroCuotas: number;
  adelantoCuota: number;
  /** YYYY-MM-DD Colombia en que se desembolsó. Si coincide con el día, no entra al estimado. */
  diaAlta: string | null;
};

export type PagoJornadaInput = {
  prestamoId: string;
  monto: number;
  tipo: string;
  anulado: boolean;
  fechaMs: number;
  saldoPendienteAntes?: number;
  adelantoCuotaAntes?: number;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Id de documento: un registro por ruta y día. */
export function jornadaDiaDocId(fechaDia: string, rutaId: string): string {
  return `${fechaDia}_${rutaId}`;
}

/**
 * Cuota que toca cobrar hoy.
 * La próxima cuota descuenta el adelanto ya abonado: valorCuota − (adelanto % valorCuota).
 * Si el saldo es menor, se toma el saldo.
 */
export function cuotaARecogerDelPrestamo(p: {
  saldoPendiente: number;
  totalAPagar: number;
  numeroCuotas: number;
  adelantoCuota?: number;
}): number {
  const saldo = round2(Math.max(0, num(p.saldoPendiente)));
  const total = num(p.totalAPagar);
  const n = num(p.numeroCuotas);
  if (saldo <= 0 || total <= 0 || n <= 0) return 0;
  const valorCuota = total / n;
  if (!(valorCuota > 0)) return 0;
  const adelanto = Math.max(0, num(p.adelantoCuota));
  const resto = adelanto % valorCuota;
  const proxima = round2(Math.max(0, valorCuota - resto));
  const objetivo = proxima > 0.009 ? proxima : round2(Math.min(saldo, valorCuota));
  return round2(Math.min(saldo, objetivo));
}

function pagosDelPrestamo(pagos: PagoJornadaInput[], prestamoId: string): PagoJornadaInput[] {
  return pagos
    .filter((p) => p.prestamoId === prestamoId && p.tipo === "pago" && !p.anulado && p.monto > 0)
    .sort((a, b) => a.fechaMs - b.fechaMs);
}

/** Estado del préstamo al empezar el día, reconstruido con el primer cobro de hoy si ya hubo. */
function estadoAlInicioDelDia(
  prestamo: PrestamoJornadaInput,
  cobrosHoy: PagoJornadaInput[]
): { saldoPendiente: number; adelantoCuota: number } {
  const primero = cobrosHoy[0];
  if (primero && typeof primero.saldoPendienteAntes === "number") {
    return {
      saldoPendiente: primero.saldoPendienteAntes,
      adelantoCuota:
        typeof primero.adelantoCuotaAntes === "number"
          ? primero.adelantoCuotaAntes
          : prestamo.adelantoCuota,
    };
  }
  const cobrado = cobrosHoy.reduce((s, p) => s + p.monto, 0);
  return {
    saldoPendiente: round2(prestamo.saldoPendiente + cobrado),
    adelantoCuota: prestamo.adelantoCuota,
  };
}

/**
 * Estimado congelado del día + lo ya cobrado.
 * Los préstamos desembolsados hoy no entran al estimado (esperan a la jornada siguiente).
 * Lo recogido suma todos los cobros del día de la ruta, también los de préstamos nuevos.
 */
export function resumirJornadaDia(
  prestamos: PrestamoJornadaInput[],
  pagos: PagoJornadaInput[],
  fechaDia: string
): JornadaMontos {
  let montoARecoger = 0;
  for (const prestamo of prestamos) {
    if (prestamo.diaAlta && prestamo.diaAlta === fechaDia) continue;
    const cobrosHoy = pagosDelPrestamo(pagos, prestamo.id);
    const inicio = estadoAlInicioDelDia(prestamo, cobrosHoy);
    montoARecoger += cuotaARecogerDelPrestamo({
      saldoPendiente: inicio.saldoPendiente,
      totalAPagar: prestamo.totalAPagar,
      numeroCuotas: prestamo.numeroCuotas,
      adelantoCuota: inicio.adelantoCuota,
    });
  }

  const montoRecogido = pagos.reduce((s, p) => {
    if (p.tipo !== "pago" || p.anulado || !(p.monto > 0)) return s;
    return s + p.monto;
  }, 0);

  return cerrarMontos(montoARecoger, montoRecogido);
}

export function cerrarMontos(montoARecoger: number, montoRecogido: number): JornadaMontos {
  const aRecoger = round2(Math.max(0, montoARecoger));
  const recogido = round2(Math.max(0, montoRecogido));
  return {
    montoARecoger: aRecoger,
    montoRecogido: recogido,
    montoRestante: round2(Math.max(0, aRecoger - recogido)),
  };
}

/** Aplica un cobro (positivo) o una anulación (negativo) sobre la caché ya guardada. */
export function aplicarDeltaJornada(actual: JornadaMontos, deltaRecogido: number): JornadaMontos {
  return cerrarMontos(actual.montoARecoger, actual.montoRecogido + deltaRecogido);
}

export function montosJornadaDesdeDatos(data: Record<string, unknown> | undefined): JornadaMontos {
  const montoARecoger = num(data?.montoARecoger);
  const montoRecogido = num(data?.montoRecogido);
  if (typeof data?.montoRestante === "number" && Number.isFinite(data.montoRestante)) {
    return {
      montoARecoger: round2(Math.max(0, montoARecoger)),
      montoRecogido: round2(Math.max(0, montoRecogido)),
      montoRestante: round2(Math.max(0, data.montoRestante)),
    };
  }
  return cerrarMontos(montoARecoger, montoRecogido);
}
