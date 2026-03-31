import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { invertirAdminEnCajaRuta } from "@/lib/invertir-caja-ruta-admin";

/** POST: transfiere monto de caja del admin a caja de una ruta (solo admin dueño de la ruta). */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { rutaId, monto } = body as { rutaId?: string; monto?: number };

  if (!rutaId || typeof rutaId !== "string" || !rutaId.trim()) {
    return NextResponse.json({ error: "Indica la ruta" }, { status: 400 });
  }
  if (typeof monto !== "number" || !Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "Indica un monto válido mayor a 0" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    const result = await invertirAdminEnCajaRuta(
      db,
      apiUser.empresaId,
      apiUser.uid,
      rutaId.trim(),
      monto
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al invertir en la ruta";
    const status =
      msg.includes("insuficiente") || msg.includes("Solo puedes") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
