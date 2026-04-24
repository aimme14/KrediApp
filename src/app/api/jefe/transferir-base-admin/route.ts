import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  getCapitalEmpresa,
  transferirBaseEmpresaAAdmin,
  historialCapitalEmpresaToJson,
} from "@/lib/jefe-capital";

function jsonDoc(doc: Awaited<ReturnType<typeof getCapitalEmpresa>>) {
  const historial = (doc.historial ?? []).map((h) =>
    historialCapitalEmpresaToJson(h)
  );
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
 * POST: inversión a caja de administrador (base empresa → cajaAdmin).
 * Body: { adminUid: string, monto: number }
 */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe") {
    return NextResponse.json(
      { error: "Solo el jefe puede invertir en la caja de administradores" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const adminUid =
    typeof body.adminUid === "string" ? body.adminUid.trim() : "";
  const monto =
    typeof body.monto === "number"
      ? body.monto
      : Number(String(body.monto ?? "").replace(/,/g, ""));

  if (!adminUid) {
    return NextResponse.json({ error: "adminUid es obligatorio" }, { status: 400 });
  }
  if (Number.isNaN(monto) || monto <= 0) {
    return NextResponse.json(
      { error: "El monto debe ser un número mayor a 0" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  try {
    const doc = await transferirBaseEmpresaAAdmin(db, apiUser.uid, adminUid, monto);
    return NextResponse.json(jsonDoc(doc));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al registrar la inversión";
    const status =
      msg.includes("insuficiente") ||
      msg.includes("no pertenece") ||
      msg.includes("no es un administrador") ||
      msg.includes("Debes indicar") ||
      msg.includes("propio jefe") ||
      msg.includes("mayor a 0")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
