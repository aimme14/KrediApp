/**
 * Control de acceso por empresa: fecha límite (accesoHasta) y habilitación en cascada.
 * Afecta a todos los /users con el mismo empresaId (jefe/adminEmpresa + admins + trabajadores).
 */

import type { Firestore } from "firebase-admin/firestore";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";
import { syncCustomClaimsForUid } from "@/lib/sync-custom-claims";
import {
  EMPRESAS_COLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import {
  buildEmpresaAccesoInfo,
} from "@/lib/empresa-acceso-fechas";

export type { AccesoHastaInput, EmpresaAccesoInfo } from "@/lib/empresa-acceso-fechas";
export {
  empresaAccesoVencido,
  diasRestantesAccesoEmpresa,
  buildEmpresaAccesoInfo,
  normalizarAccesoHastaInput,
} from "@/lib/empresa-acceso-fechas";

/**
 * Habilita o deshabilita a todos los usuarios de la empresa y marca empresa.activa.
 */
export async function setEmpresaAccesoCompleto(
  db: Firestore,
  empresaId: string,
  enabled: boolean
): Promise<{ uidsActualizados: string[] }> {
  const now = new Date();
  const empRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);

  await empRef.set({ activa: enabled, updatedAt: now }, { merge: true });

  const usersSnap = await db
    .collection(USERS_COLLECTION)
    .where("empresaId", "==", empresaId)
    .get();

  const uidsActualizados: string[] = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    uidsActualizados.push(uid);
    await userDoc.ref.update({ enabled, updatedAt: now });

    const usuarioRef = empRef.collection(USUARIOS_SUBCOLLECTION).doc(uid);
    const usuarioSnap = await usuarioRef.get();
    if (usuarioSnap.exists) {
      await usuarioRef.update({ activo: enabled });
    }
  }

  await Promise.all(uidsActualizados.map((uid) => syncCustomClaimsForUid(uid)));

  return { uidsActualizados };
}

/** Si la empresa tiene accesoHasta vencido, deshabilita en cascada. Devuelve true si deshabilitó. */
export async function procesarEmpresaSiExpirada(
  db: Firestore,
  empresaId: string,
  hoyYmd: string = fechaDiaColombiaHoy()
): Promise<boolean> {
  const empSnap = await db.collection(EMPRESAS_COLLECTION).doc(empresaId).get();
  if (!empSnap.exists) return false;

  const info = buildEmpresaAccesoInfo(empresaId, empSnap.data(), hoyYmd);
  if (!info.vencido) return false;

  await setEmpresaAccesoCompleto(db, empresaId, false);
  return true;
}

/** Verifica vencimiento para el usuario autenticado (no superAdmin). */
export async function verificarYProcesarAccesoEmpresaUsuario(
  db: Firestore,
  uid: string
): Promise<{ deshabilitado: boolean; empresaId: string | null }> {
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return { deshabilitado: false, empresaId: null };

  const data = userSnap.data()!;
  const empresaId = typeof data.empresaId === "string" ? data.empresaId : "";
  if (!empresaId) return { deshabilitado: false, empresaId: null };

  const deshabilitado = await procesarEmpresaSiExpirada(db, empresaId);
  return { deshabilitado, empresaId };
}

/** Busca empresas activas con accesoHasta vencido y las deshabilita. */
export async function expirarTodasLasEmpresasVencidas(
  db: Firestore,
  hoyYmd: string = fechaDiaColombiaHoy()
): Promise<{ empresasProcesadas: string[] }> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .where("activa", "==", true)
    .where("accesoHasta", "<=", hoyYmd)
    .get();

  const empresasProcesadas: string[] = [];

  for (const doc of snap.docs) {
    const info = buildEmpresaAccesoInfo(doc.id, doc.data(), hoyYmd);
    if (!info.accesoHasta || !info.vencido) continue;
    await setEmpresaAccesoCompleto(db, doc.id, false);
    empresasProcesadas.push(doc.id);
  }

  return { empresasProcesadas };
}
