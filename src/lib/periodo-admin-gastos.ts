/**
 * Gastos del periodo contable admin: agregación por ruta y admin.
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  GASTOS_ADMIN_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";
import type {
  PeriodoAdminSnapshot,
  PeriodoAdminSnapshotRuta,
} from "@/lib/periodo-admin-snapshot";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ymdColombia(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

/** Incluye gastos con fecha al inicio del día Colombia aunque sea anterior al instante de apertura. */
export function gastoOcurreEnPeriodo(fechaGasto: Date, desde: Date, hasta: Date): boolean {
  const desdeMs = desde.getTime();
  const hastaMs = hasta.getTime();
  const t = fechaGasto.getTime();

  if (t >= desdeMs && t <= hastaMs) return true;

  const ymd = ymdColombia(fechaGasto);
  const dayStart = inicioDiaColombiaUtc(ymd);
  const dayEnd = finDiaColombiaUtc(ymd);
  if (!dayStart || !dayEnd) return false;

  if (Math.abs(t - dayStart.getTime()) <= 1000) {
    return dayEnd.getTime() >= desdeMs && dayStart.getTime() <= hastaMs;
  }

  return false;
}

export type GastosPeriodoAgregados = {
  gastosAdminGeneral: number;
  gastosRutaPorRuta: Map<string, number>;
  gastosEmpleadosPorRuta: Map<string, number>;
};

export async function aggregateGastosPeriodoAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  rutaIds: string[],
  periodo: { desde: Date; hasta: Date }
): Promise<GastosPeriodoAgregados> {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const { desde, hasta } = periodo;
  const rutaIdSet = new Set(rutaIds);

  const gastosRutaPorRuta = new Map<string, number>();
  const gastosAdminPorRuta = new Map<string, number>();

  const gastosAdminSnap = await empresaRef
    .collection(GASTOS_ADMIN_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .get();

  for (const d of gastosAdminSnap.docs) {
    const x = d.data();
    const fecha = toDate(x.fecha);
    if (!fecha || !gastoOcurreEnPeriodo(fecha, desde, hasta)) continue;

    const monto = typeof x.monto === "number" ? x.monto : 0;
    if (monto <= 0) continue;

    const alcance = x.alcance as string;
    const rutaId = typeof x.rutaId === "string" ? x.rutaId.trim() : "";
    if (alcance === "ruta" && rutaId) {
      gastosRutaPorRuta.set(rutaId, (gastosRutaPorRuta.get(rutaId) ?? 0) + monto);
    } else {
      gastosAdminPorRuta.set("admin", (gastosAdminPorRuta.get("admin") ?? 0) + monto);
    }
  }

  const gastosEmpleadosPorRuta = new Map<string, number>();
  const empleadoDocsSeen = new Set<string>();

  const addEmpleadoDoc = (d: QueryDocumentSnapshot) => {
    if (empleadoDocsSeen.has(d.id)) return;
    empleadoDocsSeen.add(d.id);

    const x = d.data();
    const fecha = toDate(x.fecha);
    if (!fecha || !gastoOcurreEnPeriodo(fecha, desde, hasta)) return;

    const monto = typeof x.monto === "number" ? x.monto : 0;
    if (monto <= 0) return;

    const rutaId = typeof x.rutaId === "string" ? x.rutaId.trim() : "";
    if (!rutaId || !rutaIdSet.has(rutaId)) return;

    const docAdminId = typeof x.adminId === "string" ? x.adminId.trim() : "";
    if (docAdminId && docAdminId !== adminUid) return;

    gastosEmpleadosPorRuta.set(
      rutaId,
      (gastosEmpleadosPorRuta.get(rutaId) ?? 0) + monto
    );
  };

  const empleadoByAdminSnap = await empresaRef
    .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .get();
  for (const d of empleadoByAdminSnap.docs) addEmpleadoDoc(d);

  for (const rutaId of rutaIds) {
    const snap = await empresaRef
      .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
      .where("rutaId", "==", rutaId)
      .get();
    for (const d of snap.docs) addEmpleadoDoc(d);
  }

  return {
    gastosAdminGeneral: round2(gastosAdminPorRuta.get("admin") ?? 0),
    gastosRutaPorRuta,
    gastosEmpleadosPorRuta,
  };
}

export function gastosTotalesRutaSnapshot(r: PeriodoAdminSnapshotRuta | undefined): number {
  if (!r) return 0;
  if (
    typeof r.gastosRuta === "number" ||
    typeof r.gastosEmpleados === "number"
  ) {
    return round2((r.gastosRuta ?? 0) + (r.gastosEmpleados ?? 0));
  }
  if (typeof r.gastosTotales === "number") return r.gastosTotales;
  const legacy = r as PeriodoAdminSnapshotRuta & { gastos?: number };
  return typeof legacy.gastos === "number" ? legacy.gastos : 0;
}

export function gastosPersonalesAdminSnapshot(s: PeriodoAdminSnapshot): number {
  if (typeof s.admin.gastosAdmin === "number") return s.admin.gastosAdmin;
  return 0;
}

export function gastosTotalesAdminSnapshot(s: PeriodoAdminSnapshot): number {
  const personal = gastosPersonalesAdminSnapshot(s);
  const rutas = s.rutas.reduce((sum, r) => sum + gastosTotalesRutaSnapshot(r), 0);
  return round2(personal + rutas);
}

export function applyGastosToSnapshotRutas(
  rutas: PeriodoAdminSnapshotRuta[],
  agregados: GastosPeriodoAgregados
): PeriodoAdminSnapshotRuta[] {
  return rutas.map((r) => {
    const gastosRuta = round2(agregados.gastosRutaPorRuta.get(r.rutaId) ?? 0);
    const gastosEmpleados = round2(
      agregados.gastosEmpleadosPorRuta.get(r.rutaId) ?? 0
    );
    const gastosTotales = round2(gastosRuta + gastosEmpleados);
    return {
      ...r,
      gastosRuta,
      gastosAdmin: 0,
      gastosEmpleados,
      gastosTotales,
    };
  });
}

export async function enrichSnapshotGastosDelPeriodo(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  snapshot: PeriodoAdminSnapshot,
  periodo: { desde: Date; hasta: Date }
): Promise<PeriodoAdminSnapshot> {
  const rutaIds = snapshot.rutas.map((r) => r.rutaId);
  const agregados = await aggregateGastosPeriodoAdmin(
    db,
    empresaId,
    adminUid,
    rutaIds,
    periodo
  );
  const rutas = applyGastosToSnapshotRutas(snapshot.rutas, agregados);
  const gastosAdmin = agregados.gastosAdminGeneral;
  const gastosTotales = round2(
    gastosAdmin + rutas.reduce((s, r) => s + r.gastosTotales, 0)
  );

  return {
    ...snapshot,
    admin: {
      ...snapshot.admin,
      gastosAdmin,
      gastosTotales,
    },
    rutas,
  };
}
