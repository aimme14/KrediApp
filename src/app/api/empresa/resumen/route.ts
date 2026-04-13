import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { listarGastosRutaPorAdmin } from "@/lib/gastos-totals";
import { computeCapitalAdmin, computeCapitalRutaFromRutaFields } from "@/lib/capital-formulas";

export type ResumenRutaItem = {
  rutaId: string;
  nombre: string;
  ubicacion: string;
  ingreso: number;
  egreso: number;
  gastos: number;
  salidas: number;
  inversion: number;
  bolsa: number;
  cajaRuta: number;
  cajasEmpleados: number;
  ganancias: number;
  perdidas: number;
  utilidad: number;
  /** Capital de la ruta (capitalTotal persistido o fórmula operativa). */
  capitalRuta: number;
  adminId: string;
};

/** GET: resumen económico por ruta (ingreso, egreso, gastos, salidas, inversión, bolsa) */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);

  const rutasSnap = await empresaRef.collection(RUTAS_SUBCOLLECTION).get();
  const prestamosSnap = await empresaRef
    .collection(PRESTAMOS_SUBCOLLECTION)
    .where("adminId", "==", apiUser.uid)
    .get();
  const gastosLista = await listarGastosRutaPorAdmin(
    db,
    apiUser.empresaId,
    apiUser.uid
  );

  const prestamos = prestamosSnap.docs.map((d) => {
    const data = d.data();
    return {
      rutaId: data.rutaId ?? "",
      totalAPagar: data.totalAPagar ?? 0,
      saldoPendiente: data.saldoPendiente ?? 0,
    };
  });

  const rutas: ResumenRutaItem[] = rutasSnap.docs.map((d) => {
    const data = d.data();
    const rutaId = d.id;
    const nombre = data.nombre ?? "";
    const ubicacion = data.ubicacion ?? "";
    const adminId = typeof data.adminId === "string" ? data.adminId : "";

    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
    const inversion = typeof data.inversiones === "number" ? data.inversiones : 0;
    const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
    const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;

    const ingreso = prestamos
      .filter((p) => p.rutaId === rutaId)
      .reduce((sum, p) => sum + (p.totalAPagar - p.saldoPendiente), 0);
    const gastosRuta = gastosLista
      .filter((g) => g.rutaId === rutaId)
      .reduce((sum, g) => sum + g.monto, 0);

    const utilidad = ganancias - gastosRuta - perdidas;

    const capitalTotalRaw =
      typeof data.capitalTotal === "number" ? data.capitalTotal : undefined;
    const capitalRuta = computeCapitalRutaFromRutaFields({
      cajaRuta,
      cajasEmpleados,
      inversiones: inversion,
      ganancias,
      perdidas,
      capitalTotal: capitalTotalRaw,
    });

    return {
      rutaId,
      nombre,
      ubicacion,
      adminId,
      ingreso: Math.round(ingreso * 100) / 100,
      egreso: 0,
      gastos: gastosRuta,
      salidas: 0,
      inversion,
      bolsa: ganancias,
      cajaRuta,
      cajasEmpleados,
      ganancias,
      perdidas,
      utilidad: Math.round(utilidad * 100) / 100,
      capitalRuta: Math.round(capitalRuta * 100) / 100,
    };
  });

  const utilidadGlobal = rutas.reduce((sum, r) => sum + r.utilidad, 0);

  let capitalAdmin = 0;
  if (apiUser.role === "admin") {
    const userRef = empresaRef.collection(USUARIOS_SUBCOLLECTION).doc(apiUser.uid);
    const userSnap = await userRef.get();
    const u = userSnap.data() ?? {};
    const cajaAdmin = typeof u.cajaAdmin === "number" ? u.cajaAdmin : 0;

    let sumaCapitalRutas = 0;
    for (const d of rutasSnap.docs) {
      const data = d.data();
      if ((data.adminId as string) !== apiUser.uid) continue;
      const capitalTotal =
        typeof data.capitalTotal === "number"
          ? data.capitalTotal
          : (typeof data.cajaRuta === "number" ? data.cajaRuta : 0) +
            (typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0) +
            (typeof data.inversiones === "number" ? data.inversiones : 0);
      sumaCapitalRutas += capitalTotal;
    }

    capitalAdmin = computeCapitalAdmin({
      cajaAdmin,
      sumaCapitalRutas,
    });
    capitalAdmin = Math.round(capitalAdmin * 100) / 100;
  }

  return NextResponse.json({
    rutas,
    utilidadGlobal: Math.round(utilidadGlobal * 100) / 100,
    capitalAdmin,
  });
}
