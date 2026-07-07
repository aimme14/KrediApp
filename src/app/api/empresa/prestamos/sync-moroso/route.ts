import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { backfillMorosoEmpresa } from "@/lib/sync-prestamo-moroso";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

/** POST: sincroniza moroso de clientes morosos hacia sus préstamos (migración / reparación). */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isAdminPanelApiUser(apiUser) && apiUser.role !== "jefe" && apiUser.role !== "empleado") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const adminId = apiUser.role === "empleado" ? undefined : apiUser.uid;

  try {
    await backfillMorosoEmpresa(db, apiUser.empresaId, adminId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sync-moroso]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al sincronizar moroso" },
      { status: 500 }
    );
  }
}
