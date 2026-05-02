import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminBucket } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, REPORTES_DIA_SUBCOLLECTION } from "@/lib/empresas-db";

const URL_TTL_MS = 15 * 60 * 1000;

/** GET: URL firmada de descarga del PDF del reporte (solo admin dueño del reporte). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reporteId: string }> }
) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { reporteId } = await params;
  if (!reporteId?.trim()) {
    return NextResponse.json({ error: "Reporte no válido" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(REPORTES_DIA_SUBCOLLECTION)
    .doc(reporteId.trim());

  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  const x = snap.data() as Record<string, unknown>;
  if (x.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const pdfStoragePath =
    typeof x.pdfStoragePath === "string" && x.pdfStoragePath.trim()
      ? x.pdfStoragePath.trim()
      : "";
  if (!pdfStoragePath) {
    const err =
      typeof x.pdfError === "string" && x.pdfError.trim()
        ? x.pdfError.trim()
        : "PDF no disponible";
    return NextResponse.json({ error: err }, { status: 404 });
  }

  try {
    const bucket = getAdminBucket();
    const file = bucket.file(pdfStoragePath);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + URL_TTL_MS,
    });
    return NextResponse.json({ url, expiresInSeconds: URL_TTL_MS / 1000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo generar el enlace";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
