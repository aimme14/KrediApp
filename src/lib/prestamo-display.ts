import type { PrestamoItem } from "@/lib/empresa-api";

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

function claveFechaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Préstamo creado en el día local del navegador. */
export function esPrestamoCreadoHoy(p: PrestamoFechaCreacion): boolean {
  const iso = fechaCreacionPrestamoIso(p);
  if (!iso) return false;
  const hoy = claveFechaLocal(new Date());
  return claveFechaLocal(new Date(iso)) === hoy;
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
