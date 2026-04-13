/**
 * Agregados de capital (Admin SDK): admins, gastos y snapshots empresa.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  USUARIOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_CAJA_ADMIN_DOC,
  CAPITAL_CAJA_EMPLEADO_DOC,
} from "@/lib/empresas-db";
import { listarGastosParaCapitalAdmin } from "@/lib/gastos-totals";
import { computeCapitalAdmin, computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { syncAllCapitalRutaSnapshots } from "@/lib/capital-ruta-snapshot";

export interface CapitalAdminDesglose {
  adminUid: string;
  cajaAdmin: number;
  sumaCapitalRutas: number;
  gastosAdmin: number;
  gastosRuta: number;
  /** Suma de ruta.perdidas (informativo; el capital de ruta ya lo refleja en capitalTotal) */
  perdidasAcumuladasRutas: number;
  capitalAdmin: number;
}

/** Suma montos de gastos del admin: con ruta vs sin ruta (gastos generales). */
export function sumarGastosAdminDesdeLista(
  gastos: Array<{ monto?: number; rutaId?: string }>
): { gastosAdmin: number; gastosRuta: number } {
  let gastosAdmin = 0;
  let gastosRuta = 0;
  for (const g of gastos) {
    const m = typeof g.monto === "number" ? g.monto : 0;
    const rid = g.rutaId;
    if (rid && String(rid).trim() !== "") {
      gastosRuta += m;
    } else {
      gastosAdmin += m;
    }
  }
  return { gastosAdmin, gastosRuta };
}

async function listarAdmins(
  db: Firestore,
  empresaId: string
): Promise<string[]> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .where("rol", "==", "admin")
    .get();
  return snap.docs.map((d) => d.id);
}

/** Suma capitalRuta (capitalTotal) de todas las rutas de un administrador. */
async function sumaCapitalRutasPorAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<{ suma: number; perdidasAcumuladasRutas: number }> {
  const rutasSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .get();
  let suma = 0;
  let perdidasAcumuladasRutas = 0;
  for (const d of rutasSnap.docs) {
    const data = d.data();
    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const cajasEmpleados =
      typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
    const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
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
    suma += capitalTotal;
    perdidasAcumuladasRutas += typeof data.perdidas === "number" ? data.perdidas : 0;
  }
  return { suma, perdidasAcumuladasRutas };
}

async function gastosDelAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<Array<{ monto?: number; rutaId?: string }>> {
  return listarGastosParaCapitalAdmin(db, empresaId, adminUid);
}

/**
 * Calcula el capital de cada administrador y la suma total.
 */
export async function computeSumaCapitalAdminsDetalle(
  db: Firestore,
  empresaId: string
): Promise<{ desgloses: CapitalAdminDesglose[]; sumaCapitalAdmins: number }> {
  const adminUids = await listarAdmins(db, empresaId);
  const desgloses: CapitalAdminDesglose[] = [];
  let sumaCapitalAdmins = 0;

  for (const adminUid of adminUids) {
    const userRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(adminUid);
    const userSnap = await userRef.get();
    const u = userSnap.data() ?? {};
    const cajaAdmin = typeof u.cajaAdmin === "number" ? u.cajaAdmin : 0;

    const { suma: sumaCapitalRutas, perdidasAcumuladasRutas } =
      await sumaCapitalRutasPorAdmin(db, empresaId, adminUid);
    const gastosList = await gastosDelAdmin(db, empresaId, adminUid);
    const { gastosAdmin, gastosRuta } = sumarGastosAdminDesdeLista(gastosList);

    const capitalAdmin = computeCapitalAdmin({
      cajaAdmin,
      sumaCapitalRutas,
    });

    desgloses.push({
      adminUid,
      cajaAdmin,
      sumaCapitalRutas,
      gastosAdmin,
      gastosRuta,
      perdidasAcumuladasRutas,
      capitalAdmin,
    });
    sumaCapitalAdmins += capitalAdmin;
  }

  return { desgloses, sumaCapitalAdmins };
}

/** Suma de cajasEmpleados en todas las rutas (indicador agregado). */
export async function sumaCajasEmpleadosRutas(
  db: Firestore,
  empresaId: string
): Promise<number> {
  const rutasSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .get();
  let suma = 0;
  for (const d of rutasSnap.docs) {
    const c = d.data().cajasEmpleados;
    if (typeof c === "number") suma += c;
  }
  return suma;
}

/**
 * Persiste documentos agregados cajaAdmin y cajaEmpleado y sincroniza snapshots de rutas.
 */
export async function persistAggregatedCapitalDocs(
  db: Firestore,
  empresaId: string
): Promise<void> {
  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    empresaId
  );
  const sumaCajasEmpleados = await sumaCajasEmpleadosRutas(db, empresaId);
  const now = new Date();

  await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_CAJA_ADMIN_DOC)
    .set(
      {
        sumaCapitalAdmins,
        updatedAt: now,
      },
      { merge: true }
    );

  await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_CAJA_EMPLEADO_DOC)
    .set(
      {
        sumaCajasEmpleados,
        updatedAt: now,
      },
      { merge: true }
    );

  await syncAllCapitalRutaSnapshots(db, empresaId);
}
