import { getAdminBucket } from "@/lib/firebase-admin";

/** Estructura acordada: `empresas/{empresaId}/reportesDia/{reporteDiaId}/cierre.pdf` */
export function reporteCierrePdfStoragePath(empresaId: string, reporteDiaId: string): string {
  return `empresas/${empresaId}/reportesDia/${reporteDiaId}/cierre.pdf`;
}

export async function uploadReporteCierrePdfBuffer(
  empresaId: string,
  reporteDiaId: string,
  bytes: Uint8Array
): Promise<string> {
  const path = reporteCierrePdfStoragePath(empresaId, reporteDiaId);
  const bucket = getAdminBucket();
  const file = bucket.file(path);
  await file.save(Buffer.from(bytes), {
    contentType: "application/pdf",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000",
      metadata: { empresaId, reporteDiaId, tipo: "reporte_cierre" },
    },
  });
  return path;
}
