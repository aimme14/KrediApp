import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  fechaDiaColombiaHoy,
  finDiaColombiaUtc,
  inicioDiaColombiaUtc,
} from "@/lib/colombia-day-bounds";
import { PAGOS_SUBCOLLECTION } from "@/lib/empresas-db";
import { TIPO_PAGO_PASA_MAS_TARDE } from "@/lib/pasa-mas-tarde-constants";

export function boundsHoyColombiaTimestamps(): {
  start: Timestamp;
  end: Timestamp;
  fechaDia: string;
} {
  const fechaDia = fechaDiaColombiaHoy();
  const startDate = inicioDiaColombiaUtc(fechaDia);
  const endDate = finDiaColombiaUtc(fechaDia);
  if (!startDate || !endDate) {
    throw new Error("FECHA_DIA_INVALIDA");
  }
  return {
    start: Timestamp.fromDate(startDate),
    end: Timestamp.fromDate(endDate),
    fechaDia,
  };
}

/** Anula marcadores «pasa más tarde» activos del día (Colombia) en la misma transacción. */
export async function anularPasaMasTardeHoyEnTx(
  tx: Transaction,
  prestamoRef: DocumentReference,
  now: Date
): Promise<number> {
  const { start, end } = boundsHoyColombiaTimestamps();
  const snap = await tx.get(
    prestamoRef
      .collection(PAGOS_SUBCOLLECTION)
      .where("fecha", ">=", start)
      .where("fecha", "<=", end)
  );
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.tipo !== TIPO_PAGO_PASA_MAS_TARDE || data.estado === "anulado") continue;
    tx.update(doc.ref, {
      estado: "anulado",
      anuladoEn: now,
      resueltoPor: "pago",
    });
    count += 1;
  }
  return count;
}

/** Devuelve id del marcador activo hoy, si existe. */
export async function idPasaMasTardeActivoHoy(
  db: Firestore,
  prestamoRef: FirebaseFirestore.DocumentReference
): Promise<string | null> {
  const { start, end } = boundsHoyColombiaTimestamps();
  const snap = await prestamoRef
    .collection(PAGOS_SUBCOLLECTION)
    .where("fecha", ">=", start)
    .where("fecha", "<=", end)
    .get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.tipo === TIPO_PAGO_PASA_MAS_TARDE && data.estado !== "anulado") {
      return doc.id;
    }
  }
  return null;
}
