import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { ingresarBaseAdminEmpresa } from "@/lib/admin-empresa-capital";
import { withRateLimit } from "@/lib/with-rate-limit";
import { financialWriteLimiterUser } from "@/lib/rate-limit";
import { runIdempotent } from "@/lib/financial-idempotency";


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
  const { idempotencyKey } = body as { idempotencyKey?: string };
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

  const outcome = await runIdempotent({
    db,
    empresaId: apiUser.empresaId,
    key: idempotencyKey,
    endpoint: "admin-empresa:ingresar-base",
    uid: apiUser.uid,
    handler: async () => {
      try {
        const result = await ingresarBaseAdminEmpresa(
          db,
          apiUser.empresaId,
          apiUser.uid,
          monto
        );
        return { status: 200, payload: { ok: true, cajaAdmin: result.cajaAdmin } };
      } catch (e) {
        return {
          status: 400,
          payload: {
            error: e instanceof Error ? e.message : "Error al ingresar a la base",
          },
        };
      }
    },
  });

  return NextResponse.json(outcome.payload, { status: outcome.status });
}

export const POST = withRateLimit(financialWriteLimiterUser, postHandler);
