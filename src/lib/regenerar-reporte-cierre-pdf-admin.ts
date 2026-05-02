import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { buildCierreDiaSnapshot } from "@/lib/cierre-dia-snapshot";
import { buildReporteCierrePdf } from "@/lib/reporte-cierre-pdf";
import { uploadReporteCierrePdfBuffer } from "@/lib/reporte-cierre-storage";
import {
  EMPRESAS_COLLECTION,
  REPORTES_DIA_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";

/**
 * Vuelve a generar y sube el PDF de cierre, y limpia `pdfError` en el documento.
 */
export async function regenerarPdfReporteCierreDia(
  db: Firestore,
  empresaId: string,
  reporteDiaId: string
): Promise<{ pdfStoragePath: string }> {
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(REPORTES_DIA_SUBCOLLECTION)
    .doc(reporteDiaId);

  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Reporte no encontrado");
  }

  const x = snap.data() as Record<string, unknown>;
  const rutaId = typeof x.rutaId === "string" ? x.rutaId : "";
  const empleadoUid = typeof x.empleadoId === "string" ? x.empleadoId : "";
  const fechaDia = typeof x.fechaDia === "string" ? x.fechaDia : "";
  const empleadoNombre =
    typeof x.empleadoNombre === "string" && x.empleadoNombre.trim()
      ? x.empleadoNombre.trim()
      : "—";
  const montoEntregado = typeof x.montoEntregado === "number" ? x.montoEntregado : 0;
  const comentarioRaw = x.comentario;
  const comentarioTrabajador =
    typeof comentarioRaw === "string" && comentarioRaw.trim()
      ? comentarioRaw.trim()
      : null;
  const fechaDoc = x.fecha as { toDate?: () => Date } | undefined;
  const aprobadoEn = typeof fechaDoc?.toDate === "function" ? fechaDoc.toDate() : new Date();

  if (!rutaId || !empleadoUid || !fechaDia) {
    throw new Error("El documento del reporte no tiene ruta, empleado o fecha operativa");
  }

  const rutaSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId)
    .get();
  const rutaNombreRaw = rutaSnap.exists ? rutaSnap.data()?.nombre : "";
  const rutaNombre =
    typeof rutaNombreRaw === "string" && rutaNombreRaw.trim()
      ? rutaNombreRaw.trim()
      : rutaId;

  const snapshot = await buildCierreDiaSnapshot(db, {
    empresaId,
    empleadoUid,
    rutaId,
    fechaDia,
  });

  const pdfBytes = await buildReporteCierrePdf(snapshot, {
    rutaNombre,
    empleadoNombre,
    montoEntregado,
    comentarioTrabajador,
    aprobadoEn,
  });

  const pdfStoragePath = await uploadReporteCierrePdfBuffer(empresaId, reporteDiaId, pdfBytes);

  await ref.update({
    pdfStoragePath,
    pdfGeneradoEn: Timestamp.now(),
    snapshotVersion: 1,
    pdfError: FieldValue.delete(),
  });

  return { pdfStoragePath };
}
