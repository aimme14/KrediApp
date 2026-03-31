/**
 * Totales y lecturas cruzadas de subcolecciones de gastos (Admin SDK).
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  GASTOS_SUBCOLLECTION,
  GASTOS_EMPRESA_SUBCOLLECTION,
  GASTOS_ADMIN_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
} from "@/lib/empresas-db";

export async function sumGastosEmpresaCollection(
  db: Firestore,
  empresaId: string
): Promise<number> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(GASTOS_EMPRESA_SUBCOLLECTION)
    .get();
  let suma = 0;
  for (const d of snap.docs) {
    const m = d.data().monto;
    if (typeof m === "number") suma += m;
  }
  return suma;
}

/** Lista unificada para capital admin: legacy `gastos` + `gastosAdministrador`. */
export async function listarGastosParaCapitalAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<Array<{ monto?: number; rutaId?: string }>> {
  const [legacySnap, nuevoSnap] = await Promise.all([
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get(),
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_ADMIN_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get(),
  ]);

  const out: Array<{ monto?: number; rutaId?: string }> = [];
  for (const d of legacySnap.docs) {
    const data = d.data();
    out.push({
      monto: data.monto as number | undefined,
      rutaId: data.rutaId as string | undefined,
    });
  }
  for (const d of nuevoSnap.docs) {
    const data = d.data();
    const rutaId =
      data.alcance === "ruta" && typeof data.rutaId === "string"
        ? data.rutaId
        : "";
    out.push({
      monto: data.monto as number | undefined,
      rutaId: rutaId || undefined,
    });
  }
  return out;
}

/** Gastos con ruta asignados a un admin (resumen económico). */
export async function listarGastosRutaPorAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<Array<{ rutaId: string; monto: number }>> {
  const [legacySnap, adminSnap] = await Promise.all([
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get(),
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_ADMIN_SUBCOLLECTION)
      .where("adminId", "==", adminUid)
      .get(),
  ]);
  const out: Array<{ rutaId: string; monto: number }> = [];
  for (const d of legacySnap.docs) {
    const data = d.data();
    const rutaId = (data.rutaId as string) ?? "";
    if (!rutaId.trim()) continue;
    out.push({
      rutaId,
      monto: typeof data.monto === "number" ? data.monto : 0,
    });
  }
  for (const d of adminSnap.docs) {
    const data = d.data();
    if (data.alcance !== "ruta") continue;
    const rutaId = (data.rutaId as string) ?? "";
    if (!rutaId.trim()) continue;
    out.push({
      rutaId,
      monto: typeof data.monto === "number" ? data.monto : 0,
    });
  }
  return out;
}

/** Gastos por ruta para cierres (toda la empresa): legacy + administrador con alcance ruta. */
export async function listarGastosConRutaParaEmpresa(
  db: Firestore,
  empresaId: string
): Promise<Array<{ rutaId: string; monto: number }>> {
  const [legacySnap, adminSnap] = await Promise.all([
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_SUBCOLLECTION)
      .get(),
    db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(GASTOS_ADMIN_SUBCOLLECTION)
      .get(),
  ]);

  const out: Array<{ rutaId: string; monto: number }> = [];
  for (const d of legacySnap.docs) {
    const data = d.data();
    const rutaId = (data.rutaId as string) ?? "";
    if (!rutaId.trim()) continue;
    const monto = typeof data.monto === "number" ? data.monto : 0;
    out.push({ rutaId, monto });
  }
  for (const d of adminSnap.docs) {
    const data = d.data();
    if (data.alcance !== "ruta") continue;
    const rutaId = (data.rutaId as string) ?? "";
    if (!rutaId.trim()) continue;
    const monto = typeof data.monto === "number" ? data.monto : 0;
    out.push({ rutaId, monto });
  }
  return out;
}
