import type { DocumentSnapshot } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  computeCapitalAdmin,
  computeCapitalRutaFromRutaFields,
  computeCapitalRutaParaSumaAdmin,
} from "@/lib/capital-formulas";

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
  const isAdmin = apiUser.role === "admin";

  const [rutasSnap, userSnap] = await Promise.all([
    isAdmin
      ? empresaRef.collection(RUTAS_SUBCOLLECTION).where("adminId", "==", apiUser.uid).get()
      : empresaRef.collection(RUTAS_SUBCOLLECTION).get(),
    isAdmin
      ? empresaRef.collection(USUARIOS_SUBCOLLECTION).doc(apiUser.uid).get()
      : Promise.resolve(null as DocumentSnapshot | null),
  ]);

  let sumaCapitalRutas = 0;
  const rutas: ResumenRutaItem[] = [];

  for (const d of rutasSnap.docs) {
    const data = d.data();
    const rutaId = d.id;
    const adminId = typeof data.adminId === "string" ? data.adminId : "";

    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
    const inversion = typeof data.inversiones === "number" ? data.inversiones : 0;
    const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
    const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;

    const ingreso = typeof data.cobradoAcumulado === "number" ? data.cobradoAcumulado : 0;
    const gastosRuta = typeof data.gastos === "number" ? data.gastos : 0;
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

    if (isAdmin) {
      sumaCapitalRutas += computeCapitalRutaParaSumaAdmin({
        cajaRuta,
        cajasEmpleados,
        inversiones: inversion,
        capitalTotal: capitalTotalRaw,
      });
    }

    rutas.push({
      rutaId,
      nombre: data.nombre ?? "",
      ubicacion: data.ubicacion ?? "",
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
    });
  }

  const utilidadGlobal = rutas.reduce((sum, r) => sum + r.utilidad, 0);

  let capitalAdmin = 0;
  if (isAdmin && userSnap) {
    const u = userSnap.data() ?? {};
    const cajaAdmin = typeof u.cajaAdmin === "number" ? u.cajaAdmin : 0;
    capitalAdmin =
      Math.round(computeCapitalAdmin({ cajaAdmin, sumaCapitalRutas }) * 100) / 100;
  }

  return NextResponse.json({
    rutas,
    utilidadGlobal: Math.round(utilidadGlobal * 100) / 100,
    capitalAdmin,
  });
}
