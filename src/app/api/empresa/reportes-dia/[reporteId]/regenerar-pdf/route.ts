import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, REPORTES_DIA_SUBCOLLECTION } from "@/lib/empresas-db";
import { regenerarPdfReporteCierreDia } from "@/lib/regenerar-reporte-cierre-pdf-admin";

/** POST: regenera y sube el PDF del reporte (admin dueño del documento). */
export async function POST(
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
  const id = reporteId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Reporte no válido" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(REPORTES_DIA_SUBCOLLECTION)
    .doc(id);

  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  const x = snap.data() as Record<string, unknown>;
  if (x.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { pdfStoragePath } = await regenerarPdfReporteCierreDia(db, empresaId, id);
    return NextResponse.json({ ok: true, pdfStoragePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo regenerar el PDF";
    console.error("[reporte-cierre] regenerar-pdf:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
