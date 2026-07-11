/**
 * Capital del administrador de empresa (rol adminEmpresa): ingreso externo a cajaAdmin.
 */

import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  USUARIOS_SUBCOLLECTION,
  INGRESOS_BASE_ADMIN_EMPRESA_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { sumarCajaAdmin } from "@/lib/admin-capital";
import { persistAggregatedCapitalDocs } from "@/lib/capital-aggregates";

export interface IngresoBaseAdminEmpresaEntry {
  id: string;
  monto: number;
  cajaAnterior: number;
  cajaNueva: number;
  at: Date;
  adminUid: string;
}

export async function ingresarBaseAdminEmpresa(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  monto: number
): Promise<{ cajaAdmin: number }> {
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0");

  const adminRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid);

  const adminSnap = await adminRef.get();
  if (!adminSnap.exists) {
    throw new Error("Administrador de empresa no encontrado");
  }
  const adminData = adminSnap.data()!;
  if ((adminData.rol as string) !== "adminEmpresa") {
    throw new Error("Solo un administrador de empresa puede registrar este ingreso");
  }

  const cajaAnterior =
    typeof adminData.cajaAdmin === "number" ? adminData.cajaAdmin : 0;
  const cajaNueva = await sumarCajaAdmin(db, empresaId, adminUid, monto);
  const now = new Date();

  await adminRef
    .collection(INGRESOS_BASE_ADMIN_EMPRESA_SUBCOLLECTION)
    .doc()
    .set({
      monto,
      cajaAnterior,
      cajaNueva,
      at: Timestamp.fromDate(now),
      adminUid,
    });

  await persistAggregatedCapitalDocs(db, empresaId);

  return { cajaAdmin: cajaNueva };
}

export async function listIngresosBaseAdminEmpresa(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  cursor?: Date
): Promise<IngresoBaseAdminEmpresaEntry[]> {
  const base = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminUid)
    .collection(INGRESOS_BASE_ADMIN_EMPRESA_SUBCOLLECTION)
    .orderBy("at", "desc");

  const snap = await (cursor
    ? base.startAfter(Timestamp.fromDate(cursor)).limit(10)
    : base.limit(10)
  ).get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      monto: typeof data.monto === "number" ? data.monto : 0,
      cajaAnterior: typeof data.cajaAnterior === "number" ? data.cajaAnterior : 0,
      cajaNueva: typeof data.cajaNueva === "number" ? data.cajaNueva : 0,
      at: (data.at as { toDate?: () => Date })?.toDate?.() ?? new Date(0),
      adminUid: typeof data.adminUid === "string" ? data.adminUid : adminUid,
    };
  });
}
