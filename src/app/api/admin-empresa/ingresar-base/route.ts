import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { ingresarBaseAdminEmpresa } from "@/lib/admin-empresa-capital";
import { withRateLimit } from "@/lib/with-rate-limit";
import { financialWriteLimiterUser } from "@/lib/rate-limit";


/** POST: ingreso externo a la base del administrador de empresa. Body: { monto: number } */
async function postHandler(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "adminEmpresa") {
    return NextResponse.json(
      { error: "Solo un administrador de empresa puede ingresar dinero a su base" },
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
    const result = await ingresarBaseAdminEmpresa(
      db,
      apiUser.empresaId,
      apiUser.uid,
      monto
    );
    return NextResponse.json({ ok: true, cajaAdmin: result.cajaAdmin });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al ingresar a la base" },
      { status: 400 }
    );
  }
}

export const POST = withRateLimit(financialWriteLimiterUser, postHandler);
