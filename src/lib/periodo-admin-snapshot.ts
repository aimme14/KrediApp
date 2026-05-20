/**
 * Snapshots de apertura/cierre de periodo contable (solo admin y sus rutas; sin desglose empleado).
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { listarGastosRutaPorAdmin } from "@/lib/gastos-totals";
import { computeCapitalAdmin, computeCapitalRutaFromRutaFields } from "@/lib/capital-formulas";

export type PeriodoAdminSnapshotAdmin = {
  cajaAdmin: number;
  capitalAdmin: number;
  /** Suma de `ganancias` de todas las rutas del admin (congelada en apertura/cierre). */
  gananciasRutas?: number;
};

export type PeriodoAdminSnapshotRuta = {
  rutaId: string;
  nombre: string;
  cajaRuta: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
  gastos: number;
  capitalRuta: number;
  utilidad: number;
};

export type PeriodoAdminSnapshot = {
  admin: PeriodoAdminSnapshotAdmin;
  rutas: PeriodoAdminSnapshotRuta[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lee el estado financiero del admin y solo rutas con `adminId` === adminUid.
 */
export async function buildPeriodoAdminSnapshot(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<PeriodoAdminSnapshot> {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const [rutasSnap, userSnap, gastosLista] = await Promise.all([
    empresaRef
      .collection(RUTAS_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get(),
    empresaRef.collection(USUARIOS_SUBCOLLECTION).doc(adminUid).get(),
    listarGastosRutaPorAdmin(db, empresaId, adminUid),
  ]);

  const u = userSnap.data() ?? {};
  const cajaAdmin = typeof u.cajaAdmin === "number" ? u.cajaAdmin : 0;

  const gastosPorRuta = new Map<string, number>();
  for (const g of gastosLista) {
    gastosPorRuta.set(g.rutaId, (gastosPorRuta.get(g.rutaId) ?? 0) + g.monto);
  }

  const rutas: PeriodoAdminSnapshotRuta[] = [];
  let sumaCapitalRutas = 0;

  for (const d of rutasSnap.docs) {
    const data = d.data();

    const rutaId = d.id;
    const nombre = (data.nombre as string) ?? "";
    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
    const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
    const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
    const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;

    const gastosRuta = gastosPorRuta.get(rutaId) ?? 0;

    const capitalTotalRaw =
      typeof data.capitalTotal === "number" ? data.capitalTotal : undefined;
    const capitalRuta =
      capitalTotalRaw ??
      computeCapitalRutaFromRutaFields({
        cajaRuta,
        cajasEmpleados,
        inversiones,
        ganancias,
        perdidas,
      });

    const utilidad = ganancias - gastosRuta - perdidas;

    const capitalTotalForSuma =
      typeof data.capitalTotal === "number"
        ? data.capitalTotal
        : (typeof data.cajaRuta === "number" ? data.cajaRuta : 0) +
          (typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0) +
          (typeof data.inversiones === "number" ? data.inversiones : 0);
    sumaCapitalRutas += capitalTotalForSuma;

    rutas.push({
      rutaId,
      nombre,
      cajaRuta,
      inversiones,
      ganancias,
      perdidas,
      gastos: round2(gastosRuta),
      capitalRuta: round2(capitalRuta),
      utilidad: round2(utilidad),
    });
  }

  rutas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const gananciasRutas = round2(rutas.reduce((s, r) => s + r.ganancias, 0));

  const capitalAdmin = round2(
    computeCapitalAdmin({
      cajaAdmin,
      sumaCapitalRutas,
    })
  );

  return {
    admin: {
      cajaAdmin: round2(cajaAdmin),
      capitalAdmin,
      gananciasRutas,
    },
    rutas,
  };
}
