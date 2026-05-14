/**
 * Tras aprobar la entrega del reporte: borra archivos de evidencia en Storage
 * y elimina el campo `evidencia` en los documentos de pago del cierre.
 */

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import type { CierreDiaSnapshot } from "@/lib/cierre-dia-snapshot";
import { getAdminBucket } from "@/lib/firebase-admin";
import {
  EMPRESAS_COLLECTION,
  PAGOS_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

/** Ruta del objeto en el bucket a partir de una URL de descarga típica de Firebase. */
export function storageObjectPathFromFirebaseDownloadUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/o\/(.+?)\?/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1].replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/**
 * Cobros por transferencia con evidencia: borra el archivo en Storage (por URL única)
 * y quita `evidencia` en Firestore para cada pago listado en el snapshot.
 */
export async function purgeTransferenciaEvidenciasDelCierre(
  db: Firestore,
  empresaId: string,
  snapshot: CierreDiaSnapshot
): Promise<void> {
  const rows = snapshot.cobros.filter(
    (c) =>
      c.metodoPago === "transferencia" &&
      typeof c.evidencia === "string" &&
      c.evidencia.trim().length > 0
  );
  if (rows.length === 0) return;

  const bucket = getAdminBucket();
  const urlsDeleted = new Set<string>();

  for (const row of rows) {
    const url = row.evidencia!.trim();
    if (urlsDeleted.has(url)) continue;
    urlsDeleted.add(url);
    const path = storageObjectPathFromFirebaseDownloadUrl(url);
    if (!path) {
      console.warn("[evidencia-purge] URL no reconocida, se omite Storage:", url.slice(0, 96));
      continue;
    }
    try {
      await bucket.file(path).delete({ ignoreNotFound: true });
    } catch (e) {
      console.error("[evidencia-purge] Error borrando Storage:", path, e);
    }
  }

  const prestamosCol = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION);

  for (const row of rows) {
    try {
      await prestamosCol
        .doc(row.prestamoId)
        .collection(PAGOS_SUBCOLLECTION)
        .doc(row.pagoId)
        .update({ evidencia: FieldValue.delete() });
    } catch (e) {
      console.error(
        "[evidencia-purge] Error quitando evidencia en Firestore:",
        row.prestamoId,
        row.pagoId,
        e
      );
    }
  }
}
