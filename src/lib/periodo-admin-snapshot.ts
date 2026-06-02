/**
 * Snapshots de apertura/cierre de periodo contable (admin y sus rutas).
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  aggregateGastosPeriodoAdmin,
  applyGastosToSnapshotRutas,
} from "@/lib/periodo-admin-gastos";

export type PeriodoAdminSnapshotAdmin = {
  cajaAdmin: number;
  capitalAdmin: number;
  /** Suma de `ganancias` de todas las rutas del admin (congelada en apertura/cierre). */
  gananciasRutas?: number;
<<<<<<< HEAD
  /** Gastos del admin (alcance administrador) en el periodo. */
  gastosAdmin?: number;
  /** Total de gastos del periodo (admin + rutas). */
  gastosTotales?: number;
=======
  gastosAdmin: number;
  gastosTotales: number;
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
};

export type PeriodoAdminSnapshotRuta = {
  rutaId: string;
  nombre: string;
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
  gastosRuta: number;
  gastosAdmin: number;
  gastosEmpleados: number;
  gastosTotales: number;
  capitalRuta: number;
};

export type PeriodoAdminSnapshot = {
  admin: PeriodoAdminSnapshotAdmin;
  rutas: PeriodoAdminSnapshotRuta[];
  fechaSnapshot: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rutasVaciasGastos(
  rutas: Omit<PeriodoAdminSnapshotRuta, "gastosRuta" | "gastosAdmin" | "gastosEmpleados" | "gastosTotales">[]
): PeriodoAdminSnapshotRuta[] {
  return rutas.map((r) => ({
    ...r,
    gastosRuta: 0,
    gastosAdmin: 0,
    gastosEmpleados: 0,
    gastosTotales: 0,
  }));
}

/**
 * Lee el estado financiero del admin y solo rutas con `adminId` === adminUid.
 * Si `periodoFechas` está definido, los gastos se filtran por el rango del periodo.
 */
export async function buildPeriodoAdminSnapshot(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  periodoFechas?: { desde: Date; hasta: Date }
): Promise<PeriodoAdminSnapshot> {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);

  const [rutasSnap, userSnap] = await Promise.all([
    empresaRef
      .collection(RUTAS_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get(),
    empresaRef.collection(USUARIOS_SUBCOLLECTION).doc(adminUid).get(),
  ]);

  const rutasBase: Omit<
    PeriodoAdminSnapshotRuta,
    "gastosRuta" | "gastosAdmin" | "gastosEmpleados" | "gastosTotales"
  >[] = [];
  let sumaCapitalRutas = 0;

  for (const d of rutasSnap.docs) {
    const data = d.data();
    const rutaId = d.id;
    const nombre = (data.nombre as string) ?? "";
    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const cajasEmpleados =
      typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
    const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
    const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
    const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;

    const capitalRuta =
      typeof data.capitalTotal === "number"
        ? data.capitalTotal
        : round2(cajaRuta + cajasEmpleados + inversiones);

    sumaCapitalRutas += capitalRuta;

<<<<<<< HEAD
    rutasBase.push({
=======
    const gastosRuta = round2(gastosRutaPorRuta.get(rutaId) ?? 0);
    const gastosEmpleados = round2(gastosEmpleadosPorRuta.get(rutaId) ?? 0);
    const gastosTotales = round2(gastosRuta + gastosEmpleados);

    rutas.push({
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
      rutaId,
      nombre,
      cajaRuta,
      cajasEmpleados,
      inversiones,
      ganancias,
      perdidas,
<<<<<<< HEAD
=======
      gastosRuta,
      gastosAdmin: 0,
      gastosEmpleados,
      gastosTotales,
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
      capitalRuta: round2(capitalRuta),
    });
  }

  rutasBase.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const u = userSnap.data() ?? {};
  const cajaAdmin = typeof u.cajaAdmin === "number" ? u.cajaAdmin : 0;
  const capitalAdmin = round2(cajaAdmin + sumaCapitalRutas);
  const gastosAdminGeneralRounded = round2(gastosAdminGeneral);
  const gastosTotalesGeneral = round2(
    gastosAdminGeneralRounded + rutas.reduce((s, r) => s + r.gastosTotales, 0)
  );

  let rutas: PeriodoAdminSnapshotRuta[] = rutasVaciasGastos(rutasBase);
  let gastosAdmin = 0;
  let gastosTotales = 0;

  if (periodoFechas) {
    const rutaIds = rutasBase.map((r) => r.rutaId);
    const agregados = await aggregateGastosPeriodoAdmin(
      db,
      empresaId,
      adminUid,
      rutaIds,
      periodoFechas
    );
    rutas = applyGastosToSnapshotRutas(
      rutasVaciasGastos(rutasBase),
      agregados
    );
    gastosAdmin = agregados.gastosAdminGeneral;
    gastosTotales = round2(
      gastosAdmin + rutas.reduce((s, r) => s + r.gastosTotales, 0)
    );
  }

  return {
    admin: {
      cajaAdmin: round2(cajaAdmin),
      capitalAdmin,
      gananciasRutas: round2(rutas.reduce((s, r) => s + r.ganancias, 0)),
<<<<<<< HEAD
      gastosAdmin,
      gastosTotales,
=======
      gastosAdmin: gastosAdminGeneralRounded,
      gastosTotales: gastosTotalesGeneral,
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
    },
    rutas,
    fechaSnapshot: new Date().toISOString(),
  };
}
