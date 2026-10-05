import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import { USERS_COLLECTION } from "@/lib/empresas-db";
import { asegurarJornadaDiaRuta, asegurarJornadasAdmin } from "@/lib/jornada-dia-cache";

/** GET: asegura la caché de hoy y devuelve las dos cifras por ruta. */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const fechaDia = fechaDiaColombiaHoy();

  try {
    if (isAdminPanelApiUser(apiUser)) {
      const rutas = await asegurarJornadasAdmin(db, apiUser.empresaId, apiUser.uid);
      return NextResponse.json({ fechaDia, rutas });
    }

    if (apiUser.role === "empleado") {
      let rutaId = apiUser.rutaId?.trim() ?? "";
      if (!rutaId) {
        const userSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
        const stored = userSnap.data()?.rutaId;
        rutaId = typeof stored === "string" ? stored.trim() : "";
      }
      if (!rutaId) {
        return NextResponse.json({ fechaDia, rutas: [] });
      }
      const cache = await asegurarJornadaDiaRuta(db, apiUser.empresaId, rutaId, fechaDia);
      return NextResponse.json({
        fechaDia,
        rutas: cache ? [cache] : [],
      });
    }

    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo calcular la jornada";
    console.error("[jornada-dia]", message);
    return NextResponse.json({ error: "No se pudo calcular la jornada" }, { status: 500 });
  }
}
