import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { getCajaAdmin } from "@/lib/admin-capital";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

/** GET: caja del administrador (solo role admin). */
export async function GET(request: NextRequest) {
  try {
    const apiUser = await getApiUser(request);
    if (!apiUser) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!isAdminPanelApiUser(apiUser)) {
      return NextResponse.json({ error: "Solo el admin puede ver la base" }, { status: 403 });
    }

    const db = getAdminFirestore();
    const cajaAdmin = await getCajaAdmin(db, apiUser.empresaId, apiUser.uid);

    return NextResponse.json({ cajaAdmin });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al obtener base del administrador" },
      { status: 500 }
    );
  }
}

