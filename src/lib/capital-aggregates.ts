/**
 * Agregados de capital (Admin SDK): admins, gastos y snapshots empresa.
 */

import type {
  Firestore,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "firebase-admin/firestore";
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

function sumaCapitalYPerdidasDesdeRutasDocs(
  rutasDocs: QueryDocumentSnapshot[]
): { sumaCapitalRutas: number; perdidasAcumuladasRutas: number } {
  let sumaCapitalRutas = 0;
  let perdidasAcumuladasRutas = 0;
  for (const d of rutasDocs) {
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
    sumaCapitalRutas += capitalTotal;
    perdidasAcumuladasRutas += typeof data.perdidas === "number" ? data.perdidas : 0;
  }
  return { sumaCapitalRutas, perdidasAcumuladasRutas };
}

/**
 * Calcula el capital de cada administrador y la suma total.
 * @param rutasSnapOpcional Si se pasa (p. ej. desde persist), evita un segundo `.get()` de rutas.
 */
export async function computeSumaCapitalAdminsDetalle(
  db: Firestore,
  empresaId: string,
  rutasSnapOpcional?: QuerySnapshot
): Promise<{ desgloses: CapitalAdminDesglose[]; sumaCapitalAdmins: number }> {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);

  const [adminsSnap, rutasSnap] = await Promise.all([
    empresaRef.collection(USUARIOS_SUBCOLLECTION).where("rol", "==", "admin").get(),
    rutasSnapOpcional
      ? Promise.resolve(rutasSnapOpcional)
      : empresaRef.collection(RUTAS_SUBCOLLECTION).get(),
  ]);

  if (adminsSnap.empty) {
    return { desgloses: [], sumaCapitalAdmins: 0 };
  }

  const rutasPorAdmin = new Map<string, QueryDocumentSnapshot[]>();
  for (const d of rutasSnap.docs) {
    const adminId = typeof d.data().adminId === "string" ? d.data().adminId.trim() : "";
    if (!adminId) continue;
    const arr = rutasPorAdmin.get(adminId);
    if (arr) arr.push(d);
    else rutasPorAdmin.set(adminId, [d]);
  }

  const adminUids = adminsSnap.docs.map((d) => d.id);
  const gastosLists = await Promise.all(
    adminUids.map((uid) => listarGastosParaCapitalAdmin(db, empresaId, uid))
  );
  const gastosPorAdmin = new Map<string, (typeof gastosLists)[number]>();
  adminUids.forEach((uid, i) => gastosPorAdmin.set(uid, gastosLists[i]));

  const desgloses: CapitalAdminDesglose[] = [];
  let sumaCapitalAdmins = 0;

  for (const adminDoc of adminsSnap.docs) {
    const adminUid = adminDoc.id;
    const u = adminDoc.data() ?? {};
    const cajaAdmin = typeof u.cajaAdmin === "number" ? u.cajaAdmin : 0;

    const rutasAdmin = rutasPorAdmin.get(adminUid) ?? [];
    const { sumaCapitalRutas, perdidasAcumuladasRutas } =
      sumaCapitalYPerdidasDesdeRutasDocs(rutasAdmin);

    const gastosList = gastosPorAdmin.get(adminUid) ?? [];
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

/** Suma `cajasEmpleados` desde un snapshot de rutas ya leído (sin I/O). */
export function sumaCajasEmpleadosDesdeRutasSnap(rutasSnap: QuerySnapshot): number {
  let suma = 0;
  for (const d of rutasSnap.docs) {
    const c = d.data().cajasEmpleados;
    if (typeof c === "number") suma += c;
  }
  return suma;
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
  return sumaCajasEmpleadosDesdeRutasSnap(rutasSnap);
}

/**
 * Persiste documentos agregados cajaAdmin y cajaEmpleado y sincroniza snapshots de rutas.
 * Una sola lectura de `rutas` para capital admin, suma de cajas empleado y snapshots por ruta.
 */
export async function persistAggregatedCapitalDocs(
  db: Firestore,
  empresaId: string
): Promise<void> {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const rutasSnap = await empresaRef.collection(RUTAS_SUBCOLLECTION).get();

  const { sumaCapitalAdmins } = await computeSumaCapitalAdminsDetalle(
    db,
    empresaId,
    rutasSnap
  );
  const sumaCajasEmpleados = sumaCajasEmpleadosDesdeRutasSnap(rutasSnap);
  const now = new Date();
  const capitalRef = empresaRef.collection(CAPITAL_SUBCOLLECTION);

  await Promise.all([
    capitalRef.doc(CAPITAL_CAJA_ADMIN_DOC).set(
      {
        sumaCapitalAdmins,
        updatedAt: now,
      },
      { merge: true }
    ),
    capitalRef.doc(CAPITAL_CAJA_EMPLEADO_DOC).set(
      {
        sumaCajasEmpleados,
        updatedAt: now,
      },
      { merge: true }
    ),
  ]);

  await syncAllCapitalRutaSnapshots(db, empresaId, rutasSnap);
}
