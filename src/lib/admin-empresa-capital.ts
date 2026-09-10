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
import { applySumarCajaAdminEnTx, cajaAdminRef } from "@/lib/admin-capital";
import { persistAggregatedCapitalDocs } from "@/lib/capital-aggregates";
import { drainLedgerOutbox, enqueueLedgerOutboxInTx } from "@/lib/financial-ledger";

export interface IngresoBaseAdminEmpresaEntry {
  id: string;
  monto: number;
  cajaAnterior: number;
  cajaNueva: number;
  at: Date;
  adminUid: string;
}

/**
 * Acredita liquidez externa en la base del adminEmpresa.
 *
 * El crédito de caja y el documento que lo justifica se escriben en la misma
 * transacción: antes eran dos pasos sueltos, y un fallo entre ellos dejaba
 * dinero ingresado sin registro de su origen.
 */
export async function ingresarBaseAdminEmpresa(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  monto: number
): Promise<{ cajaAdmin: number }> {
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0");

  const adminRef = cajaAdminRef(db, empresaId, adminUid);
  const ingresoRef = adminRef
    .collection(INGRESOS_BASE_ADMIN_EMPRESA_SUBCOLLECTION)
    .doc();

  const now = new Date();
  let cajaNueva = 0;
  let ledgerOperationIds: string[] = [];

  await db.runTransaction(async (tx) => {
    ledgerOperationIds = [];

    const adminSnap = await tx.get(adminRef);
    if (!adminSnap.exists) {
      throw new Error("Administrador de empresa no encontrado");
    }
    const adminData = adminSnap.data()!;
    if ((adminData.rol as string) !== "adminEmpresa") {
      throw new Error("Solo un administrador de empresa puede registrar este ingreso");
    }

    const cajaAnterior =
      typeof adminData.cajaAdmin === "number" ? adminData.cajaAdmin : 0;

    cajaNueva = applySumarCajaAdminEnTx(tx, { adminRef, adminSnap, monto, now });

    tx.set(ingresoRef, {
      monto,
      cajaAnterior,
      cajaNueva,
      at: Timestamp.fromDate(now),
      adminUid,
    });

    ledgerOperationIds = enqueueLedgerOutboxInTx(tx, db, empresaId, [
      {
        direction: "credit",
        walletType: "admin_caja",
        walletId: adminUid,
        amount: monto,
        balanceAfter: cajaNueva,
        eventType: "ingreso_base_admin_empresa",
        scope: "admin",
        createdBy: adminUid,
        relatedEntityType: "ingreso_base",
        relatedEntityId: ingresoRef.id,
        metadata: { ingresoId: ingresoRef.id, cajaAnterior },
        operationId: `ingreso-base:${ingresoRef.id}`,
      },
    ]);
  });

  if (ledgerOperationIds.length > 0) {
    try {
      await drainLedgerOutbox(db, empresaId, ledgerOperationIds);
    } catch (e) {
      console.warn("[ledger] Ingreso a base queda pending en el outbox", e);
    }
  }

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
