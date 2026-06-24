import type { CobrosDelDiaEmpleadoResponse } from "@/lib/empresa-api";

export function formatMontoReporteDia(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function normalizarMetodoPagoReporteDia(
  metodo: string | null | undefined
): "efectivo" | "transferencia" | "otro" {
  const m = (metodo ?? "").trim().toLowerCase();
  if (!m) return "otro";
  if (m.includes("efectivo")) return "efectivo";
  if (m.includes("transfer")) return "transferencia";
  return "otro";
}

export function totalesVistaPreviaReporte(s: CobrosDelDiaEmpleadoResponse) {
  const prestamos = s.prestamosDesembolsoDelDia ?? [];
  return {
    prestamosCapital: prestamos.reduce((a, p) => a + p.monto, 0),
    prestamosTotalAPagar: prestamos.reduce((a, p) => a + p.totalAPagar, 0),
    cobrosMonto: s.cobros.reduce((a, c) => a + c.monto, 0),
    cobrosTotalAPagar: s.cobros.reduce((a, c) => a + c.totalAPagar, 0),
    cobrosSaldoTras: s.cobros.reduce((a, c) => a + c.saldoPendienteTrasPago, 0),
    noPagoDebe: s.noPagos.reduce((a, n) => a + n.saldoPendientePrestamoActual, 0),
    noPagoTotalPrestamo: s.noPagos.reduce((a, n) => a + n.totalAPagar, 0),
    gastosMonto: s.gastosDelDia.reduce((a, g) => a + g.monto, 0),
  };
}

export type ReporteDiaPreviewMeta = {
  fechaDiaPreview: string;
  empleadoNombre: string;
  rutaNombre: string;
  montoAlSolicitar: number;
  comentarioTrabajador: string | null;
};
