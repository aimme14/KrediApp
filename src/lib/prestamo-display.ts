import type { PrestamoItem } from "@/lib/empresa-api";
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
} from "@/lib/colombia-day-bounds";

type PrestamoTotalCredito = Pick<PrestamoItem, "totalAPagar" | "monto" | "interes">;

function formatMonedaListado(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "";
  const [entero, dec = ""] = n.toFixed(2).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decTrim = dec.replace(/0+$/, "");
  return decTrim ? `${conPuntos},${decTrim}` : conPuntos;
}

/** Total del crédito (capital + interés). Prefiere `totalAPagar` del documento; calcula si falta. */
export function totalCreditoPrestamo(p: PrestamoTotalCredito): number {
  const total = p.totalAPagar;
  if (typeof total === "number" && total > 0) {
    return Math.round(total * 100) / 100;
  }
  const monto = typeof p.monto === "number" ? p.monto : 0;
  const interes = typeof p.interes === "number" ? p.interes : 0;
  if (monto <= 0) return 0;
  return Math.round(monto * (1 + interes / 100) * 100) / 100;
}

type PrestamoFechaCreacion = Pick<PrestamoItem, "creadoEn" | "fechaInicio">;

/** ISO de creación del préstamo: `creadoEn` si existe, si no `fechaInicio`. */
export function fechaCreacionPrestamoIso(p: PrestamoFechaCreacion): string | null {
  return p.creadoEn ?? p.fechaInicio ?? null;
}

/** Préstamo desembolsado en el día calendario actual (Colombia). */
export function esPrestamoCreadoHoy(
  p: PrestamoFechaCreacion,
  hoy: string = fechaDiaColombiaHoy()
): boolean {
  const iso = fechaCreacionPrestamoIso(p);
  const dia = fechaDiaCalendarioDesdeISO(iso);
  return dia !== null && dia === hoy;
}

/** Fecha corta para listados (ej. 5/06/26). */
export function formatFechaCreacionPrestamo(p: PrestamoFechaCreacion): string {
  const iso = fechaCreacionPrestamoIso(p);
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { dateStyle: "short" });
}

/** Vista compacta: saldo pendiente / total del crédito con interés (ej. 50.000/120.000). */
export function formatDebeSlashTotalCredito(
  saldoPendiente: number,
  prestamo: PrestamoTotalCredito
): string {
  return `${formatMonedaListado(saldoPendiente)}/${formatMonedaListado(totalCreditoPrestamo(prestamo))}`;
}

/** Suma de saldo pendiente por ruta (solo préstamos activos). */
export function computeSaldoPorRecogerPorRuta(
  prestamos: PrestamoItem[],
  clienteRutaPorId?: Record<string, string | undefined>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of prestamos) {
    if (p.estado !== "activo") continue;
    const rutaId = p.rutaId || clienteRutaPorId?.[p.clienteId];
    if (!rutaId) continue;
    const prev = map.get(rutaId) ?? 0;
    map.set(rutaId, Math.round((prev + (p.saldoPendiente ?? 0)) * 100) / 100);
  }
  return map;
}
