import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  getCapitalEmpresa,
  ajustarCapital,
  historialCapitalEmpresaToJson,
} from "@/lib/jefe-capital";
import { withRateLimit } from "@/lib/with-rate-limit";
import { financialWriteLimiterUser } from "@/lib/rate-limit";


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
 * POST: entrada de liquidez a la base empresa (suma a caja empresa).
 * Body: { monto: number }
 * La asignación a administradores solo ocurre al crear el usuario admin (users/create).
 */
async function postHandler(request: NextRequest) {
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
  const monto =
    typeof body.monto === "number"
      ? body.monto
      : Number(String(body.monto ?? "").replace(/,/g, ""));

  if (Number.isNaN(monto) || monto <= 0) {
    return NextResponse.json(
      { error: "El monto debe ser un número mayor a 0" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  try {
    const doc = await ajustarCapital(db, apiUser.uid, monto);
    return NextResponse.json(jsonDoc(doc));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al invertir" },
      { status: 400 }
    );
  }
}

export const POST = withRateLimit(financialWriteLimiterUser, postHandler);
