/**
 * Totales y lecturas cruzadas de subcolecciones de gastos (Admin SDK).
 * Las lecturas usan solo subcolecciones tipadas (sin legacy `gastos`).
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  GASTOS_EMPRESA_SUBCOLLECTION,
  GASTOS_ADMIN_SUBCOLLECTION,
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

/** Lista unificada para capital admin (`gastosAdministrador`). */
export async function listarGastosParaCapitalAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<Array<{ monto?: number; rutaId?: string }>> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(GASTOS_ADMIN_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    const rutaId =
      data.alcance === "ruta" && typeof data.rutaId === "string"
        ? data.rutaId
        : undefined;
    return {
      monto: data.monto as number | undefined,
      rutaId,
    };
  });
}

/**
 * Gastos con ruta asignados a un admin (resumen económico).
 * Requiere índice compuesto: `gastosAdministrador`: adminId + alcance.
 */
export async function listarGastosRutaPorAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<Array<{ rutaId: string; monto: number }>> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(GASTOS_ADMIN_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .where("alcance", "==", "ruta")
    .get();

  return snap.docs
    .map((d) => {
      const data = d.data();
      const rutaId = (data.rutaId as string) ?? "";
      return { rutaId, monto: typeof data.monto === "number" ? data.monto : 0 };
    })
    .filter((g) => g.rutaId.trim() !== "");
}

/**
 * Gastos por ruta para cierres (toda la empresa): admin con alcance ruta.
 * Índice: campo `alcance` (Firestore puede sugerir compuesto según consultas).
 */
export async function listarGastosConRutaParaEmpresa(
  db: Firestore,
  empresaId: string
): Promise<Array<{ rutaId: string; monto: number }>> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(GASTOS_ADMIN_SUBCOLLECTION)
    .where("alcance", "==", "ruta")
    .get();

  return snap.docs
    .map((d) => {
      const data = d.data();
      const rutaId = (data.rutaId as string) ?? "";
      return { rutaId, monto: typeof data.monto === "number" ? data.monto : 0 };
    })
    .filter((g) => g.rutaId.trim() !== "");
}
