import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import { asegurarJornadasTodasLasEmpresas } from "@/lib/jornada-dia-cache";

function cronAutorizado(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token === secret;
}

/**
 * 00:00 hora Colombia (05:00 UTC). Crea la caché del día.
 * Si el documento de hoy ya existe, no vuelve a calcular el estimado.
 */
export async function GET(request: NextRequest) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const { empresas, rutas } = await asegurarJornadasTodasLasEmpresas(db);
    return NextResponse.json({
      ok: true,
      fechaDia: fechaDiaColombiaHoy(),
      empresas,
      rutas,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error en cron de jornada";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
