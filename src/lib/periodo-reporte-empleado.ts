import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  REPORTES_DIA_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  fechaDiaCalendarioDesdeISO,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";

const FALLBACK_DIAS = 30;

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function inicioDelDiaColombia(fecha: Date): Date {
  const dia = fechaDiaCalendarioDesdeISO(fecha.toISOString());
  if (dia) {
    const inicio = inicioDiaColombiaUtc(dia);
    if (inicio) return inicio;
  }
  return fecha;
}

/**
 * Devuelve el rango del período actual del empleado.
 * fechaDesde = fin del último reporte aprobado + 1ms (o primer cobro/gasto, o fallback 30 días).
 * fechaHasta = instante actual, calculado una sola vez al inicio.
 */
export async function getInicioPeriodoActual(
  db: Firestore,
  params: {
    empresaId: string;
    empleadoUid: string;
    rutaId: string;
    adminId: string;
  }
): Promise<{ fechaDesde: Date; fechaHasta: Date }> {
  const fechaHasta = new Date();
  const { empresaId, empleadoUid, rutaId, adminId } = params;
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);

  const reporteSnap = await empresaRef
    .collection(REPORTES_DIA_SUBCOLLECTION)
    .where("empleadoId", "==", empleadoUid)
    .where("rutaId", "==", rutaId)
    .where("adminId", "==", adminId)
    .orderBy("fecha", "desc")
    .limit(1)
    .get();

  if (!reporteSnap.empty) {
    const ultimo = reporteSnap.docs[0].data();
    const finCierre =
      toDate(ultimo.fechaHasta) ?? toDate(ultimo.fecha);
    if (finCierre) {
      return { fechaDesde: new Date(finCierre.getTime() + 1), fechaHasta };
    }
  }

  const primerCobro = await db
    .collectionGroup(PAGOS_SUBCOLLECTION)
    .where("empleadoId", "==", empleadoUid)
    .where("rutaId", "==", rutaId)
    .orderBy("fecha", "asc")
    .limit(1)
    .get();

  if (!primerCobro.empty) {
    const pd = primerCobro.docs[0].data();
    const fechaPrimer = toDate(pd.fecha);
    if (fechaPrimer) {
      return { fechaDesde: inicioDelDiaColombia(fechaPrimer), fechaHasta };
    }
  }

  const primerGasto = await empresaRef
    .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
    .where("empleadoId", "==", empleadoUid)
    .where("rutaId", "==", rutaId)
    .orderBy("fecha", "asc")
    .limit(1)
    .get();

  if (!primerGasto.empty) {
    const gd = primerGasto.docs[0].data();
    const fechaPrimer = toDate(gd.fecha);
    if (fechaPrimer) {
      return { fechaDesde: inicioDelDiaColombia(fechaPrimer), fechaHasta };
    }
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() - FALLBACK_DIAS);
  fallback.setHours(0, 0, 0, 0);
  return { fechaDesde: fallback, fechaHasta };
}
