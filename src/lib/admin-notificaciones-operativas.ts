/**
 * Formateo de ítems de campanita admin a partir de documentos Firestore.
 * Textos alineados con `fcm-notify-admin.ts`.
 */

import type { OperativoFcmKind } from "@/context/GastoFcmCampanitaContext";
import {
  esDiaActualColombia,
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";

export const HREF_ADMIN_SOLICITUDES_PRESTAMO =
  "/dashboard/admin/solicitudes-prestamo";

export type AdminOperativoNotifItem = {
  id: string;
  kind: OperativoFcmKind;
  title: string;
  body: string;
  at: number;
  /** Enlace al abrir desde la campanita (p. ej. solicitudes pendientes). */
  href?: string;
};

function formatMontoCOP(monto: number): string {
  const n = Math.round(monto * 100) / 100;
  return `$ ${n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function truncateBody(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

function tsFromFirestore(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) {
    const ms = (value as { toMillis: () => number }).toMillis();
    if (Number.isFinite(ms)) return ms;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function fechaIsoDesdeFirestore(value: unknown): string | null {
  const ms = tsFromFirestore(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Gasto de hoy: por `creadoEn` o por día calendario de `fecha` (incluye legado medianoche UTC). */
function esGastoOperativoHoy(data: Record<string, unknown>): boolean {
  if (data.creadoEn != null) {
    return esDiaActualColombia(tsFromFirestore(data.creadoEn));
  }
  const dia = fechaDiaCalendarioDesdeISO(fechaIsoDesdeFirestore(data.fecha));
  return dia != null && dia === fechaDiaColombiaHoy();
}

/**
 * Hora para ordenar/mostrar en campanita.
 * Sin `creadoEn`, evita medianoche (todos al fondo o filtrados) con offset estable por id.
 */
function atGastoParaCampanita(
  gastoId: string,
  data: Record<string, unknown>
): number {
  if (data.creadoEn != null) {
    return tsFromFirestore(data.creadoEn);
  }
  const fechaMs = tsFromFirestore(data.fecha);
  const hoy = fechaDiaColombiaHoy();
  const inicioHoy = inicioDiaColombiaUtc(hoy)?.getTime();
  if (inicioHoy == null) return fechaMs;

  const esSoloDia =
    fechaMs === inicioHoy ||
    (() => {
      const d = new Date(fechaMs);
      return (
        d.getUTCHours() === 0 &&
        d.getUTCMinutes() === 0 &&
        d.getUTCSeconds() === 0 &&
        d.getUTCMilliseconds() === 0
      );
    })();

  if (!esSoloDia) return fechaMs;

  let h = 0;
  for (let i = 0; i < gastoId.length; i++) {
    h = (h * 33 + gastoId.charCodeAt(i)) >>> 0;
  }
  return inicioHoy + 8 * 60 * 60 * 1000 + (h % (10 * 60 * 60 * 1000));
}

const LABEL_NO_PAGO: Record<string, string> = {
  sin_fondos: "Sin fondos",
  no_estaba: "No estaba",
  promesa_pago: "Promesa de pago",
  otro: "Otro",
};

const LABEL_PERDIDA: Record<string, string> = {
  imposible_cobrar: "Imposible cobrar",
  cliente_perdido: "Cliente perdido",
  acuerdo_quita: "Acuerdo / quita",
  otro: "Otro",
};

export function mapGastoEmpleadoNotif(
  gastoId: string,
  data: Record<string, unknown>
): AdminOperativoNotifItem | null {
  if (!esGastoOperativoHoy(data)) return null;
  const at = atGastoParaCampanita(gastoId, data);
  const empleadoNombre =
    (typeof data.creadoPorNombre === "string" && data.creadoPorNombre.trim()) ||
    "Trabajador";
  const monto = typeof data.monto === "number" ? data.monto : 0;
  const descripcion =
    (typeof data.descripcion === "string" && data.descripcion.trim()) ||
    "Sin descripción";
  const motivo =
    descripcion.length > 90 ? `${descripcion.slice(0, 87)}…` : descripcion;
  return {
    id: `gasto-${gastoId}`,
    kind: "gasto",
    title: "Nuevo gasto de un trabajador",
    body: `${empleadoNombre}: ${formatMontoCOP(monto)} — ${motivo}`,
    at,
  };
}

export function mapClienteEmpleadoNotif(
  clienteId: string,
  data: Record<string, unknown>,
  empleadoNombre: string
): AdminOperativoNotifItem | null {
  const at = tsFromFirestore(data.fechaCreacion);
  if (!esDiaActualColombia(at)) return null;
  const clienteNombre =
    (typeof data.nombre === "string" && data.nombre.trim()) || "Cliente";
  return {
    id: `cliente-${clienteId}`,
    kind: "gasto",
    title: "Nuevo cliente registrado",
    body: truncateBody(`${empleadoNombre} · ${clienteNombre}`, 180),
    at,
  };
}

export function mapPrestamoEmpleadoNotif(
  prestamoId: string,
  data: Record<string, unknown>,
  empleadoNombre: string
): AdminOperativoNotifItem | null {
  const at = tsFromFirestore(data.creadoEn);
  if (!esDiaActualColombia(at)) return null;
  const clienteNombre =
    (typeof data.clienteNombre === "string" && data.clienteNombre.trim()) ||
    "Cliente";
  const monto = typeof data.monto === "number" ? data.monto : 0;
  return {
    id: `prestamo-${prestamoId}`,
    kind: "cuota",
    title: "Nuevo préstamo desembolsado",
    body: truncateBody(
      `${empleadoNombre} · ${clienteNombre} — ${formatMontoCOP(monto)}`,
      180
    ),
    at,
  };
}

export function mapSolicitudPrestamoNotif(
  solicitudId: string,
  data: Record<string, unknown>,
  empleadoNombre: string
): AdminOperativoNotifItem | null {
  const at = tsFromFirestore(data.creadaEn);
  const clienteNombre =
    (typeof data.clienteNombre === "string" && data.clienteNombre.trim()) ||
    "Cliente";
  const monto = typeof data.monto === "number" ? data.monto : 0;
  return {
    id: `solicitud-${solicitudId}`,
    kind: "cuota",
    title: "Solicitud de préstamo",
    body: truncateBody(
      `${empleadoNombre} · ${clienteNombre} — ${formatMontoCOP(monto)}`,
      180
    ),
    at,
    href: HREF_ADMIN_SOLICITUDES_PRESTAMO,
  };
}

export function mapPagoEmpleadoNotif(
  pagoId: string,
  data: Record<string, unknown>
): AdminOperativoNotifItem | null {
  const at = tsFromFirestore(data.fecha);
  if (!esDiaActualColombia(at)) return null;

  const clienteNombre =
    (typeof data.clienteNombre === "string" && data.clienteNombre.trim()) ||
    "Cliente";
  const tipo = typeof data.tipo === "string" ? data.tipo : "pago";

  if (tipo === "pago") {
    const monto = typeof data.monto === "number" ? data.monto : 0;
    const met =
      data.metodoPago === "transferencia" ? "transferencia" : "efectivo";
    return {
      id: `pago-${pagoId}`,
      kind: "cuota",
      title: "Cuota cobrada",
      body: truncateBody(
        `${clienteNombre} · Pagó ${formatMontoCOP(monto)} (${met})`,
        180
      ),
      at,
    };
  }

  if (tipo === "no_pago") {
    const motivo =
      LABEL_NO_PAGO[(data.motivoNoPago as string) ?? ""] ?? LABEL_NO_PAGO.otro;
    return {
      id: `pago-${pagoId}`,
      kind: "cuota",
      title: "Cliente sin pago",
      body: truncateBody(`${clienteNombre} · No pagó — ${motivo}`, 180),
      at,
    };
  }

  if (tipo === "perdida") {
    const monto = typeof data.monto === "number" ? data.monto : 0;
    const motivo =
      LABEL_PERDIDA[(data.motivoPerdida as string) ?? ""] ?? LABEL_PERDIDA.otro;
    return {
      id: `pago-${pagoId}`,
      kind: "cuota",
      title: "Pérdida registrada",
      body: truncateBody(
        `${clienteNombre} · Pérdida ${formatMontoCOP(monto)} — ${motivo}`,
        180
      ),
      at,
    };
  }

  return null;
}

export function mergeAdminOperativoNotifs(
  buckets: AdminOperativoNotifItem[][]
): AdminOperativoNotifItem[] {
  const byId = new Map<string, AdminOperativoNotifItem>();
  for (const bucket of buckets) {
    for (const item of bucket) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.at - a.at);
}
