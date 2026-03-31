import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  getCapitalEmpresa,
  ajustarCapital,
  invertirCajaEmpresaEnAdministrador,
} from "@/lib/jefe-capital";

function jsonDoc(doc: Awaited<ReturnType<typeof getCapitalEmpresa>>) {
  const historial = (doc.historial ?? []).slice(0, 6).map((h) => ({
    montoAnterior: h.montoAnterior,
    montoNuevo: h.montoNuevo,
    at: h.at instanceof Date ? h.at.toISOString() : null,
  }));
  return {
    ok: true,
    capitalEmpresa: doc.capitalEmpresa,
    capitalTotal: doc.capitalEmpresa,
    cajaEmpresa: doc.cajaEmpresa,
    gastosEmpresa: doc.gastosEmpresa,
    sumaCapitalAdmins: doc.sumaCapitalAdmins,
    capitalAsignadoAdmins: doc.sumaCapitalAdmins,
    monto: doc.capitalEmpresa,
    updatedAt: doc.updatedAt.toISOString(),
    historial,
  };
}

/**
 * POST: inversión desde caja empresa.
 * Body: { destino: "empresa" | "admin", monto: number, adminUid?: string }
 * - empresa: suma a caja empresa (entrada de liquidez).
 * - admin: transfiere desde caja empresa hacia cajaAdmin del administrador.
 */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe") {
    return NextResponse.json(
      { error: "Solo el jefe puede registrar inversiones" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const destino = body.destino;
  const monto =
    typeof body.monto === "number"
      ? body.monto
      : Number(String(body.monto ?? "").replace(/,/g, ""));
  const adminUid =
    typeof body.adminUid === "string" ? body.adminUid.trim() : "";

  if (destino !== "empresa" && destino !== "admin") {
    return NextResponse.json(
      { error: 'Destino inválido. Use "empresa" o "admin".' },
      { status: 400 }
    );
  }
  if (Number.isNaN(monto) || monto <= 0) {
    return NextResponse.json(
      { error: "El monto debe ser un número mayor a 0" },
      { status: 400 }
    );
  }
  if (destino === "admin" && !adminUid) {
    return NextResponse.json(
      { error: "Selecciona un administrador" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  try {
    if (destino === "empresa") {
      const doc = await ajustarCapital(db, apiUser.uid, monto);
      return NextResponse.json(jsonDoc(doc));
    }
    const doc = await invertirCajaEmpresaEnAdministrador(
      db,
      apiUser.uid,
      adminUid,
      monto
    );
    return NextResponse.json(jsonDoc(doc));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al invertir" },
      { status: 400 }
    );
  }
}
