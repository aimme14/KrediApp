/**
 * Flujo: trabajador crea solicitud → administrador aprueba (ejecuta traspaso) o rechaza.
 */

import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import { buildCierreDiaSnapshot } from "@/lib/cierre-dia-snapshot";
import { buildReporteCierrePdf } from "@/lib/reporte-cierre-pdf";
import { uploadReporteCierrePdfBuffer } from "@/lib/reporte-cierre-storage";
import {
  EMPRESAS_COLLECTION,
  REPORTES_DIA_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  entregarReporteTrabajadorARuta,
  getPreviewEntregaReporteTrabajador,
} from "@/lib/entregar-reporte-empleado-admin";

export type EstadoSolicitudEntrega = "pendiente" | "aprobada" | "rechazada";

export type SolicitudEntregaReporteDoc = {
  id: string;
  empleadoUid: string;
  empleadoNombre: string;
  rutaId: string;
  rutaNombre: string;
  adminId: string;
  estado: EstadoSolicitudEntrega;
  comentarioTrabajador: string | null;
  montoAlSolicitar: number;
  creadaEn: Date | null;
  resueltaEn: Date | null;
  resueltaPorUid: string | null;
  motivoRechazo: string | null;
  montoEntregadoEfectivo: number | null;
};

function mapSolicitud(id: string, data: Record<string, unknown>): SolicitudEntregaReporteDoc {
  const creada = data.creadaEn as { toDate?: () => Date } | undefined;
  const resuelta = data.resueltaEn as { toDate?: () => Date } | undefined;
  return {
    id,
    empleadoUid: typeof data.empleadoUid === "string" ? data.empleadoUid : "",
    empleadoNombre: typeof data.empleadoNombre === "string" ? data.empleadoNombre : "",
    rutaId: typeof data.rutaId === "string" ? data.rutaId : "",
    rutaNombre: typeof data.rutaNombre === "string" ? data.rutaNombre : "",
    adminId: typeof data.adminId === "string" ? data.adminId : "",
    estado: (data.estado as EstadoSolicitudEntrega) ?? "pendiente",
    comentarioTrabajador:
      typeof data.comentarioTrabajador === "string" && data.comentarioTrabajador.trim()
        ? data.comentarioTrabajador.trim()
        : null,
    montoAlSolicitar: typeof data.montoAlSolicitar === "number" ? data.montoAlSolicitar : 0,
    creadaEn: creada?.toDate?.() ?? null,
    resueltaEn: resuelta?.toDate?.() ?? null,
    resueltaPorUid: typeof data.resueltaPorUid === "string" ? data.resueltaPorUid : null,
    motivoRechazo:
      typeof data.motivoRechazo === "string" && data.motivoRechazo.trim()
        ? data.motivoRechazo.trim()
        : null,
    montoEntregadoEfectivo:
      typeof data.montoEntregadoEfectivo === "number" ? data.montoEntregadoEfectivo : null,
  };
}

async function solicitudPendienteDeEmpleado(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION)
    .where("estado", "==", "pendiente")
    .get();

  for (const d of snap.docs) {
    const x = d.data();
    if (typeof x.empleadoUid === "string" && x.empleadoUid === empleadoUid) {
      return { id: d.id, data: x as Record<string, unknown> };
    }
  }
  return null;
}

export async function getMiSolicitudEntregaPendiente(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<SolicitudEntregaReporteDoc | null> {
  const found = await solicitudPendienteDeEmpleado(db, empresaId, empleadoUid);
  if (!found) return null;
  return mapSolicitud(found.id, found.data);
}

export type MiEstadoSolicitudesEmpleado = {
  pendiente: SolicitudEntregaReporteDoc | null;
  ultimaRechazada: SolicitudEntregaReporteDoc | null;
};

/** Historial reciente en memoria (sin orderBy compuesto en Firestore). */
export async function getMiEstadoSolicitudesEmpleado(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<MiEstadoSolicitudesEmpleado> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION)
    .where("empleadoUid", "==", empleadoUid)
    .get();

  const mapped = snap.docs.map((d) => mapSolicitud(d.id, d.data() as Record<string, unknown>));
  const pendiente = mapped.find((s) => s.estado === "pendiente") ?? null;

  const rechazadas = mapped
    .filter((s) => s.estado === "rechazada" && s.resueltaEn)
    .sort((a, b) => (b.resueltaEn?.getTime() ?? 0) - (a.resueltaEn?.getTime() ?? 0));
  const ultimaRechazada = rechazadas[0] ?? null;

  return { pendiente, ultimaRechazada };
}

export async function listSolicitudesEntregaPendientesAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<SolicitudEntregaReporteDoc[]> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION)
    .where("estado", "==", "pendiente")
    .get();

  const out: SolicitudEntregaReporteDoc[] = [];
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.adminId !== adminUid) continue;
    out.push(mapSolicitud(d.id, data));
  }
  out.sort((a, b) => (b.creadaEn?.getTime() ?? 0) - (a.creadaEn?.getTime() ?? 0));
  return out;
}

export type CrearSolicitudEntregaResult = {
  solicitudId: string;
  montoAlSolicitar: number;
  rutaId: string;
};

export async function crearSolicitudEntregaReporte(
  db: Firestore,
  empresaId: string,
  empleadoUid: string,
  comentarioTrabajador: string | null
): Promise<CrearSolicitudEntregaResult> {
  const existing = await solicitudPendienteDeEmpleado(db, empresaId, empleadoUid);
  if (existing) {
    throw new Error("Ya enviaste una solicitud pendiente. Esperá la confirmación del administrador.");
  }

  const preview = await getPreviewEntregaReporteTrabajador(db, empresaId, empleadoUid);
  if (preview.monto <= 0) {
    throw new Error("No hay efectivo en tu base para entregar");
  }
  if (!preview.adminId) {
    throw new Error("La ruta no tiene administrador asignado");
  }

  const col = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION);

  const now = Timestamp.now();
  const ref = col.doc();
  await ref.set({
    empleadoUid,
    empleadoNombre: preview.empleadoNombre,
    rutaId: preview.rutaId,
    rutaNombre: preview.rutaNombre,
    adminId: preview.adminId,
    estado: "pendiente" as EstadoSolicitudEntrega,
    comentarioTrabajador,
    montoAlSolicitar: preview.monto,
    creadaEn: now,
  });

  return {
    solicitudId: ref.id,
    montoAlSolicitar: preview.monto,
    rutaId: preview.rutaId,
  };
}

async function appendReporteDia(
  db: Firestore,
  empresaId: string,
  params: {
    solicitudId: string;
    rutaId: string;
    empleadoId: string;
    empleadoNombre: string;
    montoEntregado: number;
    adminId: string;
    comentario: string | null;
  }
): Promise<{ id: string; fechaDia: string }> {
  const fechaDia = fechaDiaColombiaHoy();

  const col = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(REPORTES_DIA_SUBCOLLECTION);
  const docRef = col.doc();
  await docRef.set({
    fecha: Timestamp.now(),
    fechaDia,
    rutaId: params.rutaId,
    empleadoId: params.empleadoId,
    empleadoNombre: params.empleadoNombre,
    montoEntregado: params.montoEntregado,
    adminId: params.adminId,
    comentario: params.comentario,
    solicitudId: params.solicitudId,
  });

  return { id: docRef.id, fechaDia };
}

export type AprobarSolicitudEntregaResult = {
  monto: number;
  rutaId: string;
  reporteDiaId: string;
};

export async function aprobarSolicitudEntregaReporte(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  solicitudId: string
): Promise<AprobarSolicitudEntregaResult> {
  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION)
    .doc(solicitudId);

  const solSnap = await solRef.get();
  if (!solSnap.exists) throw new Error("Solicitud no encontrada");
  const sol = solSnap.data() as Record<string, unknown>;
  if (sol.estado !== "pendiente") throw new Error("La solicitud ya fue resuelta");
  if (sol.adminId !== adminUid) throw new Error("No podés confirmar solicitudes de otra administración");

  const empleadoUid = typeof sol.empleadoUid === "string" ? sol.empleadoUid : "";
  if (!empleadoUid) throw new Error("Solicitud inválida");

  const rutaIdSol = typeof sol.rutaId === "string" ? sol.rutaId : "";
  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaIdSol);
  const rutaSnap = await rutaRef.get();
  if (!rutaSnap.exists || (rutaSnap.data()?.adminId as string) !== adminUid) {
    throw new Error("La ruta ya no está bajo tu administración");
  }

  const result = await entregarReporteTrabajadorARuta(db, empresaId, empleadoUid);
  if (result.monto <= 0) {
    throw new Error("No hubo efectivo que transferir. Es posible que el trabajador ya no tenga saldo.");
  }

  const comentarioTrabajador =
    typeof sol.comentarioTrabajador === "string" && sol.comentarioTrabajador.trim()
      ? sol.comentarioTrabajador.trim()
      : null;

  const empleadoNombre =
    typeof sol.empleadoNombre === "string" && sol.empleadoNombre.trim()
      ? sol.empleadoNombre.trim()
      : "—";

  const { id: reporteDiaId, fechaDia } = await appendReporteDia(db, empresaId, {
    solicitudId,
    rutaId: result.rutaId,
    empleadoId: empleadoUid,
    empleadoNombre,
    montoEntregado: result.monto,
    adminId: adminUid,
    comentario: comentarioTrabajador,
  });

  const reporteRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(REPORTES_DIA_SUBCOLLECTION)
    .doc(reporteDiaId);

  try {
    const snapshot = await buildCierreDiaSnapshot(db, {
      empresaId,
      empleadoUid,
      rutaId: result.rutaId,
      fechaDia,
    });
    const rutaNombre =
      typeof sol.rutaNombre === "string" && sol.rutaNombre.trim()
        ? sol.rutaNombre.trim()
        : result.rutaId;
    const pdfBytes = await buildReporteCierrePdf(snapshot, {
      rutaNombre,
      empleadoNombre,
      montoEntregado: result.monto,
      comentarioTrabajador,
      aprobadoEn: new Date(),
    });
    const pdfStoragePath = await uploadReporteCierrePdfBuffer(empresaId, reporteDiaId, pdfBytes);
    await reporteRef.update({
      pdfStoragePath,
      pdfGeneradoEn: Timestamp.now(),
      snapshotVersion: 1,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reporte-cierre] No se pudo generar o subir el PDF:", msg);
    await reporteRef.update({
      pdfError: msg,
    });
  }

  const now = Timestamp.now();
  await solRef.update({
    estado: "aprobada",
    resueltaEn: now,
    resueltaPorUid: adminUid,
    montoEntregadoEfectivo: result.monto,
    reporteDiaId,
  });

  return { monto: result.monto, rutaId: result.rutaId, reporteDiaId };
}

export async function rechazarSolicitudEntregaReporte(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  solicitudId: string,
  motivoRechazo: string | null
): Promise<void> {
  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION)
    .doc(solicitudId);

  const solSnap = await solRef.get();
  if (!solSnap.exists) throw new Error("Solicitud no encontrada");
  const sol = solSnap.data() as Record<string, unknown>;
  if (sol.estado !== "pendiente") throw new Error("La solicitud ya fue resuelta");
  if (sol.adminId !== adminUid) throw new Error("No podés rechazar solicitudes de otra administración");

  const now = Timestamp.now();
  await solRef.update({
    estado: "rechazada",
    resueltaEn: now,
    resueltaPorUid: adminUid,
    motivoRechazo: motivoRechazo && motivoRechazo.trim() ? motivoRechazo.trim() : null,
  });
}
