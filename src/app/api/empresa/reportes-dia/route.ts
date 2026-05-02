import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  REPORTES_DIA_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";

/** GET: reportes de entrega del día (admin: rutas que administra). ?fecha=YYYY-MM-DD opcional (hoy por defecto). */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores" },
      { status: 403 },
    );
  }

  const fechaParam = request.nextUrl.searchParams.get("fecha");
  const fechaDia =
    fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)
      ? fechaParam
      : fechaDiaColombiaHoy();

  try {
    const db = getAdminFirestore();
    const empresaId = apiUser.empresaId;

    const rutasSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(RUTAS_SUBCOLLECTION)
      .where("adminId", "==", apiUser.uid)
      .get();
    const misRutaIds = new Set(rutasSnap.docs.map((d) => d.id));
    const rutaNombre = new Map<string, string>();
    for (const d of rutasSnap.docs) {
      const n = d.data()?.nombre;
      rutaNombre.set(d.id, typeof n === "string" ? n : "");
    }

    const repSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(REPORTES_DIA_SUBCOLLECTION)
      .where("fechaDia", "==", fechaDia)
      .get();

    const items = repSnap.docs
      .map((doc) => {
        const x = doc.data();
        const rutaId = typeof x.rutaId === "string" ? x.rutaId : "";
        if (!misRutaIds.has(rutaId)) return null;
        const comentarioRaw = x.comentario;
        const comentario =
          typeof comentarioRaw === "string" && comentarioRaw.trim()
            ? comentarioRaw.trim()
            : null;

        const pdfStoragePath =
          typeof x.pdfStoragePath === "string" && x.pdfStoragePath.trim()
            ? x.pdfStoragePath.trim()
            : "";
        const pdfError =
          typeof x.pdfError === "string" && x.pdfError.trim()
            ? x.pdfError.trim()
            : null;

        return {
          id: doc.id,
          fechaDia: typeof x.fechaDia === "string" ? x.fechaDia : fechaDia,
          rutaId,
          rutaNombre: rutaNombre.get(rutaId) ?? "",
          empleadoId: typeof x.empleadoId === "string" ? x.empleadoId : "",
          empleadoNombre:
            typeof x.empleadoNombre === "string" ? x.empleadoNombre : "",
          montoEntregado:
            typeof x.montoEntregado === "number" ? x.montoEntregado : 0,
          fecha: x.fecha?.toDate?.()?.toISOString?.() ?? null,
          comentario,
          tienePdf: Boolean(pdfStoragePath),
          pdfError,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      fechaDia: string;
      rutaId: string;
      rutaNombre: string;
      empleadoId: string;
      empleadoNombre: string;
      montoEntregado: number;
      fecha: string | null;
      comentario: string | null;
      tienePdf: boolean;
      pdfError: string | null;
    }>;

    items.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

    const totalMonto =
      Math.round(items.reduce((s, i) => s + i.montoEntregado, 0) * 100) / 100;

    return NextResponse.json({ fechaDia, items, totalMonto });
  } catch (e) {
    console.error("[GET /api/empresa/reportes-dia]", e);
    const msg = e instanceof Error ? e.message : "Error al cargar reportes";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
