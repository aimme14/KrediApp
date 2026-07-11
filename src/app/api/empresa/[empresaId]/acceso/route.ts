import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  buildEmpresaAccesoInfo,
  normalizarAccesoHastaInput,
  procesarEmpresaSiExpirada,
} from "@/lib/empresa-acceso";
import { assertSuperAdmin } from "@/lib/super-admin-auth";
import { EMPRESAS_COLLECTION } from "@/lib/empresas-db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> }
) {
  try {
    const { empresaId } = await params;
    const superAdminUid = _request.nextUrl.searchParams.get("superAdminUid");
    if (!superAdminUid) {
      return NextResponse.json({ error: "Falta superAdminUid" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const auth = await assertSuperAdmin(db, superAdminUid);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const empSnap = await db.collection(EMPRESAS_COLLECTION).doc(empresaId).get();
    if (!empSnap.exists) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    return NextResponse.json(buildEmpresaAccesoInfo(empresaId, empSnap.data()));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al consultar acceso";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> }
) {
  try {
    const { empresaId } = await params;
    const body = await request.json();
    const { accesoHasta, superAdminUid } = body as {
      accesoHasta?: unknown;
      superAdminUid: string;
    };

    if (!superAdminUid) {
      return NextResponse.json({ error: "Falta superAdminUid" }, { status: 400 });
    }
    if (!("accesoHasta" in body)) {
      return NextResponse.json({ error: "Falta accesoHasta" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const auth = await assertSuperAdmin(db, superAdminUid);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const empRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
    const empSnap = await empRef.get();
    if (!empSnap.exists) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const normalized = normalizarAccesoHastaInput(accesoHasta);
    if (accesoHasta !== null && accesoHasta !== "" && normalized === null) {
      return NextResponse.json(
        { error: "accesoHasta debe ser YYYY-MM-DD o vacío para quitar el límite" },
        { status: 400 }
      );
    }

    const now = new Date();
    const update: Record<string, unknown> = { updatedAt: now };
    if (normalized === null) {
      update.accesoHasta = null;
    } else {
      update.accesoHasta = normalized;
    }

    await empRef.set(update, { merge: true });

    let deshabilitadoPorVencimiento = false;
    if (normalized !== null) {
      deshabilitadoPorVencimiento = await procesarEmpresaSiExpirada(db, empresaId);
    }

    const updatedSnap = await empRef.get();
    return NextResponse.json({
      ok: true,
      deshabilitadoPorVencimiento,
      ...buildEmpresaAccesoInfo(empresaId, updatedSnap.data()),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al actualizar acceso";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
