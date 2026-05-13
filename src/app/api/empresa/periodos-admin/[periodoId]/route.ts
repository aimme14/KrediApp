import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, PERIODOS_ADMIN_SUBCOLLECTION } from "@/lib/empresas-db";

function tsToIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** GET: detalle de un periodo (solo el admin dueño). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodoId: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administrador" }, { status: 403 });
  }

  const { periodoId } = await params;
  if (!periodoId?.trim()) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PERIODOS_ADMIN_SUBCOLLECTION)
    .doc(periodoId);

  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Periodo no encontrado" }, { status: 404 });
  }

  const data = snap.data()!;
  if ((data.adminId as string) !== apiUser.uid) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return NextResponse.json({
    id: snap.id,
    estado: (data.estado as string) === "cerrado" ? "cerrado" : "abierto",
    fechaApertura: tsToIso(data.fechaApertura),
    fechaCierre: tsToIso(data.fechaCierre),
    abiertoPorUid: (data.abiertoPorUid as string) ?? "",
    cerradoPorUid: (data.cerradoPorUid as string) ?? null,
    apertura: data.apertura ?? null,
    cierre: data.cierre ?? null,
  });
}
