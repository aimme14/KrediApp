import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, PERIODOS_ADMIN_SUBCOLLECTION } from "@/lib/empresas-db";
import { enrichSnapshotGastosDelPeriodo } from "@/lib/periodo-admin-gastos";
import type { PeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

function tsToIso(v: unknown): string | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function tsToDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
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
  if (!isAdminPanelApiUser(apiUser)) {
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

  let apertura = (data.apertura as PeriodoAdminSnapshot | null) ?? null;
  let cierre = (data.cierre as PeriodoAdminSnapshot | null) ?? null;

  const fechaApertura = tsToDate(data.fechaApertura);
  const fechaCierre = tsToDate(data.fechaCierre);
  if (fechaApertura && cierre) {
    try {
      cierre = await enrichSnapshotGastosDelPeriodo(
        db,
        apiUser.empresaId,
        apiUser.uid,
        cierre,
        { desde: fechaApertura, hasta: fechaCierre ?? new Date() }
      );
    } catch (e) {
      console.warn("[periodos-admin] enrichSnapshotGastosDelPeriodo:", e);
    }
  }

  return NextResponse.json({
    id: snap.id,
    estado: (data.estado as string) === "cerrado" ? "cerrado" : "abierto",
    fechaApertura: tsToIso(data.fechaApertura),
    fechaCierre: tsToIso(data.fechaCierre),
    abiertoPorUid: (data.abiertoPorUid as string) ?? "",
    cerradoPorUid: (data.cerradoPorUid as string) ?? null,
    apertura,
    cierre,
  });
}
