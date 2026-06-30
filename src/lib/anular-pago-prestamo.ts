import { round2, snapPesoCOP } from "@/lib/ruta-financiera-admin";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";

export type AnulacionElegibilidadError =
  | "PAGO_NO_ACTIVO"
  | "PAGO_TIPO_INVALIDO"
  | "PAGO_FUERA_DE_PERIODO_ABIERTO"
  | "PAGO_NO_ES_ULTIMO"
  | "SIN_SNAPSHOTS_NI_FALLBACK"
  | "REPORTE_APROBADO"
  | "PRESTAMO_DESCUADRADO";

export type ModoReversion = "snapshots" | "fallback";

export type ResultadoReversion = {
  nuevoSaldoPendiente: number;
  nuevoAdelantoCuota: number;
  nuevoEstadoPrestamo: string;
  reabrePrestamo: boolean;
  nuevaCajaRuta: number;
  nuevosCajasEmpleados: number;
  nuevasInversiones: number;
  nuevasGanancias: number;
  nuevoCapitalTotal: number;
  nuevaCajaEmpleado: number | null;
  modo: ModoReversion;
};

export type DatosRuta = {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
};

export type DatosPago = {
  estado?: string;
  tipo?: string;
  monto: number;
  cuotaCapital: number;
  cuotaGanancia: number;
  acreditaCajaRuta: boolean;
  tieneSnapshotsCompletos?: boolean;
  saldoPendienteAntes?: number;
  saldoPendienteDespues?: number;
  adelantoCuotaAntes?: number;
  adelantoCuotaDespues?: number;
  estadoPrestamoAntes?: string;
  estadoPrestamoDespues?: string;
  fecha: Date;
  empleadoId: string;
};

export type DatosPrestamo = {
  saldoPendiente: number;
  adelantoCuota: number;
  estado: string;
  fechaCierre?: Date | null;
};

export type DatosEmpleado = {
  cajaEmpleado: number;
} | null;

export function validarElegibilidadAnulacion(params: {
  pago: DatosPago;
  enPeriodoAbierto: boolean;
  esUltimoPago: boolean;
  reporteAprobado: boolean;
}): AnulacionElegibilidadError | null {
  const { pago, enPeriodoAbierto, esUltimoPago, reporteAprobado } = params;

  if (pago.estado !== "activo" && pago.estado !== undefined) {
    return "PAGO_NO_ACTIVO";
  }
  if (pago.tipo !== "pago") {
    return "PAGO_TIPO_INVALIDO";
  }
  if (!enPeriodoAbierto) {
    return "PAGO_FUERA_DE_PERIODO_ABIERTO";
  }
  if (!esUltimoPago) {
    return "PAGO_NO_ES_ULTIMO";
  }
  if (reporteAprobado) {
    return "REPORTE_APROBADO";
  }
  return null;
}

/**
 * En modo snapshots, el saldo actual del préstamo debe coincidir con el guardado al cobrar.
 */
export function validarCoherenciaPrestamoConPago(
  prestamo: DatosPrestamo,
  pago: DatosPago,
  modo: ModoReversion
): AnulacionElegibilidadError | null {
  if (modo !== "snapshots") return null;
  if (typeof pago.saldoPendienteDespues !== "number") return null;
  const diff = Math.abs(round2(prestamo.saldoPendiente) - round2(pago.saldoPendienteDespues));
  if (diff > 0.02) {
    return "PRESTAMO_DESCUADRADO";
  }
  return null;
}

export function determinarModoReversion(pago: DatosPago): ModoReversion {
  if (
    pago.tieneSnapshotsCompletos === true &&
    typeof pago.saldoPendienteAntes === "number" &&
    typeof pago.adelantoCuotaAntes === "number" &&
    typeof pago.estadoPrestamoAntes === "string"
  ) {
    return "snapshots";
  }

  if (
    typeof pago.cuotaCapital === "number" &&
    typeof pago.cuotaGanancia === "number"
  ) {
    return "fallback";
  }

  throw new Error("SIN_SNAPSHOTS_NI_FALLBACK");
}

export function calcularReversion(params: {
  pago: DatosPago;
  prestamo: DatosPrestamo;
  ruta: DatosRuta;
  empleado: DatosEmpleado;
  modo: ModoReversion;
}): ResultadoReversion {
  const { pago, prestamo, ruta, empleado, modo } = params;

  let nuevoSaldoPendiente: number;
  let nuevoAdelantoCuota: number;
  let nuevoEstadoPrestamo: string;

  if (modo === "snapshots") {
    nuevoSaldoPendiente = round2(pago.saldoPendienteAntes!);
    nuevoAdelantoCuota = round2(pago.adelantoCuotaAntes!);
    nuevoEstadoPrestamo = pago.estadoPrestamoAntes!;
  } else {
    nuevoSaldoPendiente = round2(prestamo.saldoPendiente + pago.monto);
    nuevoAdelantoCuota = round2(prestamo.adelantoCuota);
    nuevoEstadoPrestamo = "activo";
  }

  const reabrePrestamo =
    prestamo.estado === "pagado" && nuevoEstadoPrestamo === "activo";

  let nuevaCajaRuta = ruta.cajaRuta;
  let nuevosCajasEmpleados = ruta.cajasEmpleados;
  let nuevasInversiones = ruta.inversiones;
  let nuevasGanancias = ruta.ganancias;

  if (pago.acreditaCajaRuta) {
    nuevaCajaRuta = round2(ruta.cajaRuta - pago.monto);
    nuevasInversiones = round2(ruta.inversiones + pago.cuotaCapital);
    nuevasGanancias = snapPesoCOP(round2(ruta.ganancias - pago.cuotaGanancia));
  } else {
    nuevosCajasEmpleados = round2(ruta.cajasEmpleados - pago.monto);
    nuevasInversiones = round2(ruta.inversiones + pago.cuotaCapital);
    nuevasGanancias = snapPesoCOP(round2(ruta.ganancias - pago.cuotaGanancia));
  }

  if (nuevasInversiones < 0) nuevasInversiones = 0;
  if (nuevasGanancias < 0) nuevasGanancias = 0;
  if (nuevaCajaRuta < 0) nuevaCajaRuta = 0;
  if (nuevosCajasEmpleados < 0) nuevosCajasEmpleados = 0;

  const nuevoCapitalTotal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta: nuevaCajaRuta,
    cajasEmpleados: nuevosCajasEmpleados,
    inversiones: nuevasInversiones,
    perdidas: ruta.perdidas,
  });

  let nuevaCajaEmpleado: number | null = null;
  if (!pago.acreditaCajaRuta && empleado !== null) {
    nuevaCajaEmpleado = round2(empleado.cajaEmpleado - pago.monto);
    if (nuevaCajaEmpleado < 0) nuevaCajaEmpleado = 0;
  }

  return {
    nuevoSaldoPendiente,
    nuevoAdelantoCuota,
    nuevoEstadoPrestamo,
    reabrePrestamo,
    nuevaCajaRuta,
    nuevosCajasEmpleados,
    nuevasInversiones,
    nuevasGanancias,
    nuevoCapitalTotal,
    nuevaCajaEmpleado,
    modo,
  };
}

export function mensajeElegibilidad(error: AnulacionElegibilidadError): string {
  switch (error) {
    case "PAGO_NO_ACTIVO":
      return "Este pago ya fue anulado.";
    case "PAGO_TIPO_INVALIDO":
      return "Solo se pueden anular cobros registrados como pago.";
    case "PAGO_FUERA_DE_PERIODO_ABIERTO":
      return "Solo se pueden anular cobros del periodo contable abierto. Cierra el periodo solo cuando ya no necesites corregir cobros.";
    case "PAGO_NO_ES_ULTIMO":
      return "No se puede anular este pago porque hay cobros posteriores en el mismo préstamo. Anula primero el cobro más reciente.";
    case "SIN_SNAPSHOTS_NI_FALLBACK":
      return "Este pago no tiene suficiente información para ser anulado. Contacta soporte.";
    case "REPORTE_APROBADO":
      return "El reporte del día ya fue aprobado. La anulación de pagos en reportes cerrados estará disponible próximamente.";
    case "PRESTAMO_DESCUADRADO":
      return "El préstamo cambió después de este cobro. No se puede anular de forma segura.";
  }
}

export function inferirAcreditaCajaRuta(pd: Record<string, unknown>): boolean {
  if (typeof pd.acreditaCajaRuta === "boolean") return pd.acreditaCajaRuta;
  const rol = typeof pd.cobradoPorRol === "string" ? pd.cobradoPorRol : "";
  const metodo = typeof pd.metodoPago === "string" ? pd.metodoPago : "";
  return rol === "admin" || metodo === "transferencia";
}
