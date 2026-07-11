import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { expirarTodasLasEmpresasVencidas } from "@/lib/empresa-acceso";

function cronAutorizado(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token === secret;
}

/**
 * Cron diario: deshabilita empresas cuyo accesoHasta ya llegó (día de pago/corte).
 * Configurar CRON_SECRET en el entorno y programar en vercel.json.
 */
export async function GET(request: NextRequest) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const { empresasProcesadas } = await expirarTodasLasEmpresasVencidas(db);
    return NextResponse.json({
      ok: true,
      empresasProcesadas,
      total: empresasProcesadas.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error en cron de acceso";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
