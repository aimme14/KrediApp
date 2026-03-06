import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  GASTOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

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
  const gastosSnap = await empresaRef
    .collection(GASTOS_SUBCOLLECTION)
    .where("adminId", "==", apiUser.uid)
    .get();

  const prestamos = prestamosSnap.docs.map((d) => {
    const data = d.data();
    return {
      rutaId: data.rutaId ?? "",
      totalAPagar: data.totalAPagar ?? 0,
      saldoPendiente: data.saldoPendiente ?? 0,
    };
  });
  const gastos = gastosSnap.docs.map((d) => {
    const data = d.data();
    return {
      rutaId: data.rutaId ?? "",
      monto: data.monto ?? 0,
    };
  });

  const rutas: ResumenRutaItem[] = rutasSnap.docs.map((d) => {
    const data = d.data();
    const rutaId = d.id;
    const nombre = data.nombre ?? "";
    const ubicacion = data.ubicacion ?? "";

    const ingreso = prestamos
      .filter((p) => p.rutaId === rutaId)
      .reduce((sum, p) => sum + (p.totalAPagar - p.saldoPendiente), 0);
    const gastosRuta = gastos
      .filter((g) => g.rutaId === rutaId)
      .reduce((sum, g) => sum + g.monto, 0);
    const gastosSinRuta = gastos
      .filter((g) => !g.rutaId || g.rutaId === "")
      .reduce((sum, g) => sum + g.monto, 0);

    return {
      rutaId,
      nombre,
      ubicacion,
      ingreso: Math.round(ingreso * 100) / 100,
      egreso: 0,
      gastos: gastosRuta,
      salidas: 0,
      inversion: 0,
      bolsa: 0,
    };
  });

  return NextResponse.json({ rutas });
}
