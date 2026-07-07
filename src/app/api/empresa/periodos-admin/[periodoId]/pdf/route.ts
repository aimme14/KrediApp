import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, PERIODOS_ADMIN_SUBCOLLECTION, USUARIOS_SUBCOLLECTION } from "@/lib/empresas-db";
import { buildPeriodoAdminPdf } from "@/lib/periodo-admin-pdf";
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

/** GET: PDF comparativo apertura / cierre. */
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

  const apertura = data.apertura as PeriodoAdminSnapshot | undefined;
  if (!apertura?.admin || !Array.isArray(apertura.rutas)) {
    return NextResponse.json({ error: "Datos de periodo incompletos" }, { status: 500 });
  }

  if ((data.estado as string) !== "cerrado") {
    return NextResponse.json(
      { error: "El PDF solo está disponible cuando el periodo está cerrado. Usa «Comparar» para ver los datos de apertura." },
      { status: 400 }
    );
  }

  const cierreRaw =
    data.cierre?.admin && Array.isArray(data.cierre.rutas)
      ? (data.cierre as PeriodoAdminSnapshot)
      : null;

  if (!cierreRaw) {
    return NextResponse.json({ error: "Falta snapshot de cierre para generar el PDF." }, { status: 400 });
  }

  const fechaApertura = tsToDate(data.fechaApertura);
  const fechaCierre = tsToDate(data.fechaCierre) ?? new Date();
  let cierre = cierreRaw;
  if (fechaApertura) {
    try {
      cierre = await enrichSnapshotGastosDelPeriodo(
        db,
        apiUser.empresaId,
        apiUser.uid,
        cierreRaw,
        { desde: fechaApertura, hasta: fechaCierre }
      );
    } catch (e) {
      console.warn("[periodos-admin/pdf] enrichSnapshotGastosDelPeriodo:", e);
    }
  }

  const usuarioSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(apiUser.uid)
    .get();
  const nombreAdmin =
    (usuarioSnap.data()?.displayName as string)?.trim() ||
    (usuarioSnap.data()?.nombre as string)?.trim() ||
    "Administrador";

  try {
    const bytes = await buildPeriodoAdminPdf({
      periodoId: snap.id,
      nombreAdmin,
      fechaAperturaIso: tsToIso(data.fechaApertura) ?? "",
      fechaCierreIso: tsToIso(data.fechaCierre),
      abiertoPorUid: (data.abiertoPorUid as string) ?? "",
      cerradoPorUid: (data.cerradoPorUid as string) ?? null,
      apertura,
      cierre,
    });

    const filename = `periodo-admin-${snap.id}.pdf`;
    const body = Buffer.from(bytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("[periodos-admin/pdf] buildPeriodoAdminPdf:", e);
    return NextResponse.json({ error: "Error al generar PDF" }, { status: 500 });
  }
}
