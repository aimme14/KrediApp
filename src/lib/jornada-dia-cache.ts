/**
 * Caché Firestore de la jornada: se crea una vez por ruta y día (Colombia)
 * y después solo se mueve lo recogido al cobrar o anular.
 */

import type { DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";
import {
  EMPRESAS_COLLECTION,
  JORNADA_DIA_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  aplicarDeltaJornada,
  jornadaDiaDocId,
  montosJornadaDesdeDatos,
  resumirJornadaDia,
  type JornadaMontos,
  type PagoJornadaInput,
  type PrestamoJornadaInput,
} from "@/lib/jornada-dia";

export type JornadaDiaCache = JornadaMontos & {
  fechaDia: string;
  rutaId: string;
  adminId: string;
};

function diaAltaDesdePrestamo(data: Record<string, unknown>): string | null {
  const fechaInicio = typeof data.fechaInicio === "string" ? data.fechaInicio : null;
  const desdeInicio = fechaDiaCalendarioDesdeISO(fechaInicio);
  if (desdeInicio) return desdeInicio;
  const creado = data.creadoEn;
  if (creado instanceof Timestamp) {
    return fechaDiaCalendarioDesdeISO(creado.toDate().toISOString());
  }
  if (typeof creado === "string") return fechaDiaCalendarioDesdeISO(creado);
  return null;
}

function prestamoInput(id: string, data: Record<string, unknown>): PrestamoJornadaInput {
  return {
    id,
    saldoPendiente: typeof data.saldoPendiente === "number" ? data.saldoPendiente : 0,
    totalAPagar: typeof data.totalAPagar === "number" ? data.totalAPagar : 0,
    numeroCuotas: typeof data.numeroCuotas === "number" ? data.numeroCuotas : 0,
    adelantoCuota: typeof data.adelantoCuota === "number" ? data.adelantoCuota : 0,
    diaAlta: diaAltaDesdePrestamo(data),
  };
}

function pagoInput(data: Record<string, unknown>): PagoJornadaInput | null {
  const prestamoId = typeof data.prestamoId === "string" ? data.prestamoId.trim() : "";
  if (!prestamoId) return null;
  const fecha = data.fecha;
  const fechaMs =
    fecha instanceof Timestamp
      ? fecha.toMillis()
      : fecha instanceof Date
        ? fecha.getTime()
        : 0;
  return {
    prestamoId,
    monto: typeof data.monto === "number" ? data.monto : 0,
    tipo: typeof data.tipo === "string" ? data.tipo : "",
    anulado: data.estado === "anulado",
    fechaMs,
    saldoPendienteAntes:
      typeof data.saldoPendienteAntes === "number" ? data.saldoPendienteAntes : undefined,
    adelantoCuotaAntes:
      typeof data.adelantoCuotaAntes === "number" ? data.adelantoCuotaAntes : undefined,
  };
}

export function jornadaDiaDocRef(
  db: Firestore,
  empresaId: string,
  fechaDia: string,
  rutaId: string
) {
  return db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(JORNADA_DIA_SUBCOLLECTION)
    .doc(jornadaDiaDocId(fechaDia, rutaId));
}

function cacheDesdeSnap(snap: DocumentSnapshot, rutaId: string): JornadaDiaCache | null {
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  const montos = montosJornadaDesdeDatos(data);
  return {
    ...montos,
    fechaDia: typeof data.fechaDia === "string" ? data.fechaDia : "",
    rutaId: typeof data.rutaId === "string" ? data.rutaId : rutaId,
    adminId: typeof data.adminId === "string" ? data.adminId : "",
  };
}

async function calcularPayload(
  db: Firestore,
  empresaId: string,
  rutaId: string,
  fechaDia: string,
  adminId: string
): Promise<Record<string, unknown>> {
  const start = inicioDiaColombiaUtc(fechaDia);
  const end = finDiaColombiaUtc(fechaDia);
  if (!start || !end) throw new Error("FECHA_DIA_INVALIDA");
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  const prestamosCol = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION);

  const [activosSnap, pagosSnap] = await Promise.all([
    prestamosCol.where("rutaId", "==", rutaId).where("estado", "==", "activo").get(),
    db
      .collectionGroup(PAGOS_SUBCOLLECTION)
      .where("empresaId", "==", empresaId)
      .where("rutaId", "==", rutaId)
      .where("fecha", ">=", startTs)
      .where("fecha", "<=", endTs)
      .get(),
  ]);

  const pagos: PagoJornadaInput[] = [];
  for (const doc of pagosSnap.docs) {
    const row = pagoInput(doc.data() as Record<string, unknown>);
    if (row) pagos.push(row);
  }

  const prestamos: PrestamoJornadaInput[] = [];
  const vistos = new Set<string>();
  for (const doc of activosSnap.docs) {
    vistos.add(doc.id);
    prestamos.push(prestamoInput(doc.id, doc.data() as Record<string, unknown>));
  }

  const cerradosHoy: string[] = [];
  const idsPago = new Set<string>();
  for (let i = 0; i < pagos.length; i += 1) {
    const prestamoId = pagos[i].prestamoId;
    if (vistos.has(prestamoId) || idsPago.has(prestamoId)) continue;
    idsPago.add(prestamoId);
    cerradosHoy.push(prestamoId);
  }
  for (let i = 0; i < cerradosHoy.length; i += 100) {
    const refs = cerradosHoy.slice(i, i + 100).map((id) => prestamosCol.doc(id));
    const snaps = await db.getAll(...refs);
    for (const doc of snaps) {
      if (!doc.exists) continue;
      prestamos.push(prestamoInput(doc.id, doc.data() as Record<string, unknown>));
    }
  }

  const montos = resumirJornadaDia(prestamos, pagos, fechaDia);
  const now = new Date();
  return {
    fechaDia,
    rutaId,
    adminId,
    empresaId,
    montoARecoger: montos.montoARecoger,
    montoRecogido: montos.montoRecogido,
    montoRestante: montos.montoRestante,
    calculadoEn: now,
    actualizadoEn: now,
  };
}

/**
 * Crea la caché del día si no existe. Si ya existe, la deja quieta:
 * el estimado no se vuelve a calcular hasta el día siguiente.
 */
export async function asegurarJornadaDiaRuta(
  db: Firestore,
  empresaId: string,
  rutaId: string,
  fechaDia: string = fechaDiaColombiaHoy()
): Promise<JornadaDiaCache | null> {
  const rutaIdTrim = rutaId.trim();
  if (!rutaIdTrim) return null;

  const ref = jornadaDiaDocRef(db, empresaId, fechaDia, rutaIdTrim);
  const previa = await ref.get();
  const ya = cacheDesdeSnap(previa, rutaIdTrim);
  if (ya && ya.fechaDia === fechaDia) return ya;

  const rutaSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaIdTrim)
    .get();
  if (!rutaSnap.exists) return null;
  const adminIdRaw = rutaSnap.data()?.adminId;
  const adminId = typeof adminIdRaw === "string" ? adminIdRaw : "";

  const payload = await calcularPayload(db, empresaId, rutaIdTrim, fechaDia, adminId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.set(ref, payload);
  });

  const despues = await ref.get();
  return cacheDesdeSnap(despues, rutaIdTrim);
}

export async function asegurarJornadasAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<JornadaDiaCache[]> {
  const rutasSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .get();

  const out: JornadaDiaCache[] = [];
  for (const ruta of rutasSnap.docs) {
    try {
      const cache = await asegurarJornadaDiaRuta(db, empresaId, ruta.id);
      if (cache) out.push(cache);
    } catch (err) {
      console.warn("[jornada-dia] ruta omitida", empresaId, ruta.id, err);
    }
  }
  return out;
}

/** Recalcula (crea) la jornada del día para todas las rutas. Lo usa el cron de medianoche. */
export async function asegurarJornadasTodasLasEmpresas(
  db: Firestore
): Promise<{ empresas: number; rutas: number }> {
  const empresasSnap = await db.collection(EMPRESAS_COLLECTION).get();
  let rutas = 0;
  for (const empresa of empresasSnap.docs) {
    if (empresa.data()?.activa === false) continue;
    const rutasSnap = await empresa.ref.collection(RUTAS_SUBCOLLECTION).get();
    for (const ruta of rutasSnap.docs) {
      try {
        const cache = await asegurarJornadaDiaRuta(db, empresa.id, ruta.id);
        if (cache) rutas += 1;
      } catch (err) {
        console.warn("[jornada-dia] ruta omitida", empresa.id, ruta.id, err);
      }
    }
  }
  return { empresas: empresasSnap.size, rutas };
}

/**
 * Dentro de una transacción que ya leyó el documento.
 * delta positivo = cobro; negativo = anulación.
 */
export function aplicarDeltaJornadaEnTx(
  tx: Transaction,
  snap: DocumentSnapshot,
  deltaRecogido: number
): void {
  if (!snap.exists || !Number.isFinite(deltaRecogido) || deltaRecogido === 0) return;
  const actual = montosJornadaDesdeDatos(snap.data() as Record<string, unknown>);
  const next = aplicarDeltaJornada(actual, deltaRecogido);
  tx.update(snap.ref, {
    montoRecogido: next.montoRecogido,
    montoRestante: next.montoRestante,
    actualizadoEn: new Date(),
  });
}
