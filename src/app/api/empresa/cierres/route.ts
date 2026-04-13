import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  CIERRES_MENSUALES_SUBCOLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_CAJA_EMPRESA_DOC,
} from "@/lib/empresas-db";
import {
  computeCapitalEmpresa,
  computeCapitalTotalRutaDesdeSaldos,
} from "@/lib/capital-formulas";
import { computeSumaCapitalAdminsDetalle } from "@/lib/capital-aggregates";
import {
  listarGastosConRutaParaEmpresa,
  sumGastosEmpresaCollection,
} from "@/lib/gastos-totals";

function getPeriodoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** GET: lista cierres mensuales o devuelve uno si se pasa ?periodo=YYYY-MM */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodo = searchParams.get("periodo")?.trim();

  const db = getAdminFirestore();
  const col = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CIERRES_MENSUALES_SUBCOLLECTION);

  if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const doc = await col.doc(periodo).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });
    }
    const data = doc.data()!;
    return NextResponse.json({
      periodo: doc.id,
      fechaCierre: data.fechaCierre?.toDate?.()?.toISOString?.() ?? null,
      rutas: data.rutas ?? [],
      cajaEmpresa: data.cajaEmpresa,
      gastosEmpresa: data.gastosEmpresa,
      capitalEmpresa: data.capitalEmpresa,
      capitalAsignadoAdmins: data.capitalAsignadoAdmins,
      utilidadGlobal: data.utilidadGlobal,
    });
  }

  const snap = await col.limit(50).get();
  const list = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        periodo: d.id,
        fechaCierre: data.fechaCierre?.toDate?.()?.toISOString?.() ?? null,
        utilidadGlobal: data.utilidadGlobal ?? 0,
        rutasCount: Array.isArray(data.rutas) ? data.rutas.length : 0,
      };
    })
    .sort((a, b) => b.periodo.localeCompare(a.periodo))
    .slice(0, 24);

  return NextResponse.json({ cierres: list });
}

/** POST: genera y guarda un cierre mensual. Body: { periodo?: "YYYY-MM" } (default: mes actual) */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe" && apiUser.role !== "admin") {
    return NextResponse.json(
      { error: "Solo el jefe o un administrador pueden ejecutar el cierre mensual" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const periodoParam = (body.periodo as string)?.trim();
  const periodo =
    periodoParam && /^\d{4}-\d{2}$/.test(periodoParam)
      ? periodoParam
      : getPeriodoFromDate(new Date());

  const db = getAdminFirestore();
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);
  const cierreRef = empresaRef.collection(CIERRES_MENSUALES_SUBCOLLECTION).doc(periodo);

  const existing = await cierreRef.get();
  if (existing.exists) {
    return NextResponse.json(
      { error: `Ya existe un cierre para el periodo ${periodo}` },
      { status: 400 }
    );
  }

  const rutasSnap = await empresaRef.collection(RUTAS_SUBCOLLECTION).get();

  const gastosConRuta = await listarGastosConRutaParaEmpresa(db, apiUser.empresaId);
  const gastosByRuta: Record<string, number> = {};
  for (const g of gastosConRuta) {
    gastosByRuta[g.rutaId] = (gastosByRuta[g.rutaId] ?? 0) + g.monto;
  }

  const rutas: Array<{
    rutaId: string;
    nombre: string;
    cajaRuta: number;
    cajasEmpleados: number;
    inversiones: number;
    ganancias: number;
    perdidas: number;
    gastos: number;
    utilidad: number;
    capitalTotal: number;
  }> = [];

  let utilidadGlobal = 0;

  rutasSnap.docs.forEach((d) => {
    const data = d.data();
    const rutaId = d.id;
    const nombre = (data.nombre as string) ?? "";
    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
    const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
    const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
    const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;
    const capitalTotal =
      typeof data.capitalTotal === "number"
        ? data.capitalTotal
        : computeCapitalTotalRutaDesdeSaldos({
            cajaRuta,
            cajasEmpleados,
            inversiones,
            perdidas,
          });
    const gastos = gastosByRuta[rutaId] ?? 0;
    const utilidad = ganancias - gastos - perdidas;
    utilidadGlobal += utilidad;
    rutas.push({
      rutaId,
      nombre,
      cajaRuta,
      cajasEmpleados,
      inversiones,
      ganancias,
      perdidas,
      gastos,
      utilidad: Math.round(utilidad * 100) / 100,
      capitalTotal,
    });
  });

  utilidadGlobal = Math.round(utilidadGlobal * 100) / 100;

  let cajaEmpresa: number | undefined;
  let capitalAsignadoAdmins: number | undefined;
  let capitalEmpresa: number | undefined;
  let gastosEmpresa: number | undefined;

  if (apiUser.role === "jefe") {
    const capitalSnap = await empresaRef
      .collection(CAPITAL_SUBCOLLECTION)
      .doc(CAPITAL_CAJA_EMPRESA_DOC)
      .get();
    if (capitalSnap.exists) {
      const cap = capitalSnap.data()!;
      cajaEmpresa = typeof cap.cajaEmpresa === "number" ? cap.cajaEmpresa : undefined;
    }
    gastosEmpresa = await sumGastosEmpresaCollection(db, apiUser.empresaId);
    const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
      db,
      apiUser.empresaId
    );
    capitalAsignadoAdmins = sumaCapitalAdmins;
    if (cajaEmpresa !== undefined) {
      capitalEmpresa = computeCapitalEmpresa(cajaEmpresa, sumaCapitalAdmins);
    }
  }

  const now = new Date();
  await cierreRef.set({
    periodo,
    fechaCierre: now,
    rutas,
    cajaEmpresa,
    gastosEmpresa,
    capitalEmpresa,
    capitalAsignadoAdmins,
    utilidadGlobal,
  });

  return NextResponse.json({
    ok: true,
    periodo,
    fechaCierre: now.toISOString(),
    utilidadGlobal,
    rutasCount: rutas.length,
  });
}
