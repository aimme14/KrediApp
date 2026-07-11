import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { listIngresosBaseAdminEmpresa } from "@/lib/admin-empresa-capital";

/** GET: historial de ingresos a base del admin empresa (solo el propio usuario). */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "adminEmpresa") {
    return NextResponse.json(
      { error: "Solo un administrador de empresa puede ver este historial" },
      { status: 403 }
    );
  }

  const cursorRaw = request.nextUrl.searchParams.get("cursor");
  const cursor = cursorRaw ? new Date(cursorRaw) : undefined;

  const db = getAdminFirestore();
  try {
    const list = await listIngresosBaseAdminEmpresa(db, apiUser.empresaId, apiUser.uid, cursor);
    return NextResponse.json({
      ingresos: list.map((i) => ({
        id: i.id,
        monto: i.monto,
        cajaAnterior: i.cajaAnterior,
        cajaNueva: i.cajaNueva,
        at: i.at.toISOString(),
      })),
      hasMore: list.length === 10,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al cargar historial" },
      { status: 500 }
    );
  }
}
