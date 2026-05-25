/**
 * Snapshots de apertura/cierre de periodo contable (admin y sus rutas).
 */

import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  GASTOS_ADMIN_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
} from "@/lib/empresas-db";

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

/**
 * Lee el estado financiero del admin y solo rutas con `adminId` === adminUid.
 * Si `periodoFechas` está definido, los gastos se filtran por `fecha` en ese rango.
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

  const startTs = periodoFechas ? Timestamp.fromDate(periodoFechas.desde) : null;
  const endTs = periodoFechas ? Timestamp.fromDate(periodoFechas.hasta) : null;

  let gastosAdminSnap;
  if (startTs && endTs) {
    gastosAdminSnap = await empresaRef
      .collection(GASTOS_ADMIN_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .where("fecha", ">=", startTs)
      .where("fecha", "<=", endTs)
      .get();
  } else {
    gastosAdminSnap = await empresaRef
      .collection(GASTOS_ADMIN_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get();
  }

  let gastosEmpleadoSnap;
  if (startTs && endTs) {
    gastosEmpleadoSnap = await empresaRef
      .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .where("fecha", ">=", startTs)
      .where("fecha", "<=", endTs)
      .get();
  } else {
    gastosEmpleadoSnap = await empresaRef
      .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get();
  }

  const gastosRutaPorRuta = new Map<string, number>();
  const gastosAdminPorRuta = new Map<string, number>();
  for (const d of gastosAdminSnap.docs) {
    const x = d.data();
    const monto = typeof x.monto === "number" ? x.monto : 0;
    const alcance = x.alcance as string;
    const rutaId = typeof x.rutaId === "string" ? x.rutaId.trim() : "";
    if (alcance === "ruta" && rutaId) {
      gastosRutaPorRuta.set(rutaId, (gastosRutaPorRuta.get(rutaId) ?? 0) + monto);
    } else {
      gastosAdminPorRuta.set("admin", (gastosAdminPorRuta.get("admin") ?? 0) + monto);
    }
  }

  const gastosEmpleadosPorRuta = new Map<string, number>();
  for (const d of gastosEmpleadoSnap.docs) {
    const x = d.data();
    const monto = typeof x.monto === "number" ? x.monto : 0;
    const rutaId = typeof x.rutaId === "string" ? x.rutaId.trim() : "";
    if (rutaId) {
      gastosEmpleadosPorRuta.set(
        rutaId,
        (gastosEmpleadosPorRuta.get(rutaId) ?? 0) + monto
      );
    }
  }

  const gastosAdminGeneral = gastosAdminPorRuta.get("admin") ?? 0;

  const rutas: PeriodoAdminSnapshotRuta[] = [];
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

    const gastosRuta = round2(gastosRutaPorRuta.get(rutaId) ?? 0);
    const gastosAdmin = round2(gastosAdminGeneral);
    const gastosEmpleados = round2(gastosEmpleadosPorRuta.get(rutaId) ?? 0);
    const gastosTotales = round2(gastosRuta + gastosAdmin + gastosEmpleados);

    rutas.push({
      rutaId,
      nombre,
      cajaRuta,
      cajasEmpleados,
      inversiones,
      ganancias,
      perdidas,
      gastosRuta,
      gastosAdmin,
      gastosEmpleados,
      gastosTotales,
      capitalRuta: round2(capitalRuta),
    });
  }

  rutas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const u = userSnap.data() ?? {};
  const cajaAdmin = typeof u.cajaAdmin === "number" ? u.cajaAdmin : 0;
  const capitalAdmin = round2(cajaAdmin + sumaCapitalRutas);

  return {
    admin: {
      cajaAdmin: round2(cajaAdmin),
      capitalAdmin,
      gananciasRutas: round2(rutas.reduce((s, r) => s + r.ganancias, 0)),
    },
    rutas,
    fechaSnapshot: new Date().toISOString(),
  };
}
