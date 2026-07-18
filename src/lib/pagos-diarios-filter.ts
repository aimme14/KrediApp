import type {
  PagoDiarioAdminItem,
  PagosDiariosAdminTotales,
} from "@/hooks/usePagosDiariosAdmin";

export type PagosDiariosFiltros = {
  rutaId?: string;
  nombreCliente?: string;
};

export function pagoCoincideNombreCliente(
  pago: PagoDiarioAdminItem,
  nombreLower: string
): boolean {
  if (!nombreLower) return true;
  return pago.clienteNombre.toLowerCase().includes(nombreLower);
}

export function pagoCoincideRuta(pago: PagoDiarioAdminItem, rutaId: string): boolean {
  if (!rutaId) return true;
  return pago.rutaId === rutaId;
}

export function filtrarPagosDiariosAdmin(
  pagos: PagoDiarioAdminItem[],
  filtros: PagosDiariosFiltros
): PagoDiarioAdminItem[] {
  const rutaId = filtros.rutaId?.trim() ?? "";
  const nombreLower = filtros.nombreCliente?.trim().toLowerCase() ?? "";

  return pagos.filter(
    (p) => pagoCoincideRuta(p, rutaId) && pagoCoincideNombreCliente(p, nombreLower)
  );
}

export function calcularTotalesPagosDiariosAdmin(
  pagos: PagoDiarioAdminItem[]
): PagosDiariosAdminTotales {
  const cobrosActivos = pagos.filter((p) => p.tipo === "pago" && p.estado === "activo");
  const noPagos = pagos.filter((p) => p.tipo === "no_pago" && p.estado === "activo");
  const perdidas = pagos.filter((p) => p.tipo === "perdida" && p.estado === "activo");

  let totalEfectivo = 0;
  let totalTransferencia = 0;
  for (const c of cobrosActivos) {
    const m = c.monto;
    if (m <= 0) continue;
    const metodo = (c.metodoPago ?? "").toLowerCase();
    if (metodo === "transferencia") totalTransferencia += m;
    else totalEfectivo += m;
  }

  return {
    totalCobros: Math.round((totalEfectivo + totalTransferencia) * 100) / 100,
    totalEfectivo: Math.round(totalEfectivo * 100) / 100,
    totalTransferencia: Math.round(totalTransferencia * 100) / 100,
    countCobros: cobrosActivos.length,
    countNoPagos: noPagos.length,
    countPerdidas: perdidas.length,
  };
}
