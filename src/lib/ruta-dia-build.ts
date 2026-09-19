import { type ClienteItem, type PrestamoItem } from "@/lib/empresa-api";
import { isPrestamoEnCobro } from "@/lib/prestamo-estado";
import {
  calcularDiasVencidos,
  calcularPrioridadCobro,
} from "@/lib/ruta-dia-prioridad";
import type {
  ClienteRuta,
  ClienteRutaGrupo,
  PrioridadClienteRuta,
} from "@/types/finanzas";

const VISITADOS_STORAGE_PREFIX = "krediapp-ruta-visitados-";

function getVisitadosKey(): string {
  return `${VISITADOS_STORAGE_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

/** Lee los clienteIds ya visitados hoy desde localStorage */
export function getVisitadosHoy(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(getVisitadosKey());
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Marca un cliente como visitado hoy en localStorage */
export function addVisitadoHoy(clienteId: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = getVisitadosKey();
    const set = new Set(getVisitadosHoy());
    set.add(clienteId);
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

export type FiltroRutaDia =
  | "todos"
  | "no_pago_hoy"
  | "pendientes"
  | "pasa_mas_tarde"
  | "cobrados"
  | "morosos";

export type MarcadoresCobroDiaHoy = {
  noPagosHoy: { prestamoId: string }[];
  pasaMasTardeHoy: { prestamoId: string }[];
};

/** Misma prioridad que `clientesFiltrados` para que el 1.er ítem del grupo = préstamo que abre Cobrar */
export function compareClienteRutaPrioridad(a: ClienteRuta, b: ClienteRuta): number {
  if (a.pasaMasTardeHoy !== b.pasaMasTardeHoy) {
    return a.pasaMasTardeHoy ? -1 : 1;
  }
  if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
  const zonaA = (a.zona ?? "").toLowerCase();
  const zonaB = (b.zona ?? "").toLowerCase();
  if (zonaA && zonaB && zonaA !== zonaB) {
    return zonaA.localeCompare(zonaB);
  }
  if (b.diasVencidos !== a.diasVencidos) return b.diasVencidos - a.diasVencidos;
  if (b.intentosFallidos !== a.intentosFallidos)
    return b.intentosFallidos - a.intentosFallidos;
  return b.monto - a.monto;
}

function isHoy(fecha: Date | null): boolean {
  if (!fecha) return false;
  const hoy = new Date();
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
}

function isMismoDia(isoDate: string | null | undefined): boolean {
  if (!isoDate || typeof isoDate !== "string") return false;
  const d = toDate(isoDate);
  return isHoy(d);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const local = new Date(y, m - 1, d);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildClientesRuta(
  clientes: ClienteItem[],
  prestamos: PrestamoItem[],
  marcadores: MarcadoresCobroDiaHoy | { prestamoId: string }[]
): ClienteRuta[] {
  const prestamosPendientes = prestamos.filter((p) => isPrestamoEnCobro(p));
  const mapClientesById = new Map(clientes.map((c) => [c.id, c]));
  const visitados = getVisitadosHoy();
  const noPagosHoy = Array.isArray(marcadores) ? marcadores : marcadores.noPagosHoy;
  const pasaMasTardeRaw = Array.isArray(marcadores) ? [] : marcadores.pasaMasTardeHoy;
  const noPagoHoySet = new Set(noPagosHoy.map((n) => n.prestamoId));
  const pasaMasTardeSet = new Set(pasaMasTardeRaw.map((n) => n.prestamoId));

  const map: ClienteRuta[] = [];
  for (const p of prestamosPendientes) {
    const c = mapClientesById.get(p.clienteId);
    const fechaV = toDate(p.fechaFinal ?? p.fechaVencimiento ?? null);
    const intentosFallidos = p.intentosFallidos ?? 0;
    const diasVencidos = calcularDiasVencidos(fechaV);
    const prioridad = calcularPrioridadCobro(fechaV, intentosFallidos);

    const cuotaPagadaHoy = isMismoDia(p.ultimoPagoFecha ?? null);

    map.push({
      cuotaId: p.id,
      prestamoId: p.id,
      clienteId: p.clienteId,
      clienteNombre: c?.nombre ?? `Cliente ${p.clienteId.slice(0, 8)}`,
      clienteDireccion: c?.direccion ?? "",
      zona: c?.ubicacion ?? "",
      monto: p.saldoPendiente ?? 0,
      fechaVencimiento: fechaV,
      estado: p.estado ?? "activo",
      frecuencia: p.modalidad ?? "",
      numeroCuota: 1,
      totalCuotas: p.numeroCuotas ?? 0,
      diasVencidos,
      intentosFallidos,
      prioridad,
      visitado: visitados.has(p.clienteId),
      cuotaPagadaHoy,
      noPagoHoy: noPagoHoySet.has(p.id),
      pasaMasTardeHoy:
        pasaMasTardeSet.has(p.id) && !cuotaPagadaHoy && !noPagoHoySet.has(p.id),
      moroso: p.moroso === true || c?.moroso === true,
    });
  }

  return map;
}

export function filtrarClientesRuta(
  clientesRuta: ClienteRuta[],
  filtro: FiltroRutaDia,
  busquedaNombre: string,
  options?: {
    rutaId?: string;
    rutaIdPorClienteId?: Map<string, string>;
    rutaIdPorPrestamoId?: Map<string, string>;
  }
): ClienteRuta[] {
  let lista = [...clientesRuta];

  const rutaId = options?.rutaId?.trim();
  if (rutaId) {
    const porCliente = options?.rutaIdPorClienteId;
    const porPrestamo = options?.rutaIdPorPrestamoId;
    lista = lista.filter((c) => {
      const fromPrestamo = porPrestamo?.get(c.prestamoId);
      const fromCliente = porCliente?.get(c.clienteId);
      return fromPrestamo === rutaId || fromCliente === rutaId;
    });
  }

  switch (filtro) {
    case "no_pago_hoy":
      lista = lista.filter((c) => c.noPagoHoy);
      break;
    case "pendientes":
      lista = lista.filter((c) => !c.cuotaPagadaHoy && !c.noPagoHoy);
      break;
    case "pasa_mas_tarde":
      lista = lista.filter((c) => c.pasaMasTardeHoy);
      break;
    case "cobrados":
      lista = lista.filter((c) => c.cuotaPagadaHoy);
      break;
    case "morosos":
      lista = lista.filter((c) => c.moroso);
      break;
    case "todos":
    default:
      break;
  }

  const q = busquedaNombre.trim().toLowerCase();
  if (q) {
    lista = lista.filter((c) => c.clienteNombre.toLowerCase().includes(q));
  }

  lista.sort(compareClienteRutaPrioridad);
  return lista;
}

export function agruparClientesRuta(clientesFiltrados: ClienteRuta[]): ClienteRutaGrupo[] {
  const byClient = new Map<string, ClienteRuta[]>();
  for (const item of clientesFiltrados) {
    const list = byClient.get(item.clienteId) ?? [];
    list.push(item);
    byClient.set(item.clienteId, list);
  }

  const groups: ClienteRutaGrupo[] = [];
  byClient.forEach((items, clienteId) => {
    const sorted = [...items].sort(compareClienteRutaPrioridad);
    const first = sorted[0]!;
    const totalMonto = sorted.reduce((s, i) => s + i.monto, 0);
    const prioridadMax = Math.min(
      ...sorted.map((i) => i.prioridad)
    ) as PrioridadClienteRuta;
    const diasVencidosMax = Math.max(...sorted.map((i) => i.diasVencidos));
    const visitado = sorted.some((i) => i.visitado);

    groups.push({
      clienteId,
      clienteNombre: first.clienteNombre,
      clienteDireccion: first.clienteDireccion,
      zona: first.zona,
      totalMonto,
      cantidadPrestamos: sorted.length,
      prioridadMax,
      diasVencidosMax,
      visitado,
      moroso: sorted.some((i) => i.moroso),
      items: sorted,
    });
  });

  groups.sort((a, b) => {
    const aPasa = a.items.some((i) => i.pasaMasTardeHoy);
    const bPasa = b.items.some((i) => i.pasaMasTardeHoy);
    if (aPasa !== bPasa) return aPasa ? -1 : 1;
    if (a.prioridadMax !== b.prioridadMax) return a.prioridadMax - b.prioridadMax;
    if (b.diasVencidosMax !== a.diasVencidosMax) return b.diasVencidosMax - a.diasVencidosMax;
    return b.totalMonto - a.totalMonto;
  });

  return groups;
}
