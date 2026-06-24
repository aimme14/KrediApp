import type { PagoDiarioAdminItem } from "@/hooks/usePagosDiariosAdmin";

export function formatMontoPagosDiarios(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatHoraPagosDiarios(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function labelTipoPagosDiarios(item: PagoDiarioAdminItem): string {
  if (item.tipo === "no_pago") return "No pagó";
  if (item.tipo === "perdida") return "Pérdida";
  return "Cobro";
}

export function labelMetodoPagosDiarios(metodo: string | null): string {
  if (!metodo) return "—";
  if (metodo === "transferencia") return "Transferencia";
  if (metodo === "efectivo") return "Efectivo";
  return metodo;
}

export function labelRegistradorPagosDiarios(item: PagoDiarioAdminItem): string {
  if (item.registradoPorNombre?.trim()) return item.registradoPorNombre.trim();
  if (item.cobradoPorRol === "admin") return "Administrador";
  return "Trabajador";
}

export function formatFechaImpresionPagosDiarios(fechaDia: string): string {
  return new Date(`${fechaDia}T12:00:00`).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
