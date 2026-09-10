import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { invertirRutaEnCajaAdmin } from "@/lib/invertir-ruta-en-caja-admin";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import { withRateLimit } from "@/lib/with-rate-limit";
import { financialWriteLimiterUser } from "@/lib/rate-limit";
import { runIdempotent } from "@/lib/financial-idempotency";


/** POST: transfiere monto de caja de una ruta a caja del admin (solo admin dueño de la ruta). */
async function postHandler(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { rutaId, monto, idempotencyKey } = body as {
    rutaId?: string;
    monto?: number;
    idempotencyKey?: string;
  };

  if (!rutaId || typeof rutaId !== "string" || !rutaId.trim()) {
    return NextResponse.json({ error: "Indica la ruta" }, { status: 400 });
  }
  if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "Indica un monto válido mayor a 0" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const rutaIdLimpio = rutaId.trim();

  const outcome = await runIdempotent({
    db,
    empresaId: apiUser.empresaId,
    key: idempotencyKey,
    endpoint: "empresa:invertir-caja-admin",
    uid: apiUser.uid,
    handler: async () => {
      try {
        const result = await invertirRutaEnCajaAdmin(
          db,
          apiUser.empresaId,
          apiUser.uid,
          rutaIdLimpio,
          monto
        );
        return { status: 200, payload: { ...result } };
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Error al invertir en la base del administrador";
        const status =
          msg.includes("insuficiente") || msg.includes("Solo puedes") ? 400 : 500;
        return { status, payload: { error: msg } };
      }
    },
  });

  return NextResponse.json(outcome.payload, { status: outcome.status });
}

export const POST = withRateLimit(financialWriteLimiterUser, postHandler);
