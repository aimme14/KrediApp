/**
 * Sincroniza empresas/{empresaId}/capital/root/rutas/{rutaId} desde el documento de ruta (cliente).
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_BRANCH_DOC_ID,
  CAPITAL_RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalRutaFromRutaFields } from "@/lib/capital-formulas";

export async function syncCapitalRutaSnapshotClient(
  empresaId: string,
  rutaId: string
): Promise<void> {
  if (!db || !empresaId || !rutaId) return;

  const rutaRef = doc(
    db,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );
  const snap = await getDoc(rutaRef);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;

  const branchRef = doc(
    db,
    EMPRESAS_COLLECTION,
    empresaId,
    CAPITAL_SUBCOLLECTION,
    CAPITAL_BRANCH_DOC_ID
  );
  await setDoc(
    branchRef,
    { kind: "capitalBranch", updatedAt: new Date() },
    { merge: true }
  );

  const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
  const cajasEmpleados =
    typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
  const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
  const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
  const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;
  const capitalTotal =
    typeof data.capitalTotal === "number" ? data.capitalTotal : undefined;
  const capitalRuta = computeCapitalRutaFromRutaFields({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    ganancias,
    perdidas,
    capitalTotal,
  });

  const snapshotRef = doc(
    db,
    EMPRESAS_COLLECTION,
    empresaId,
    CAPITAL_SUBCOLLECTION,
    CAPITAL_BRANCH_DOC_ID,
    CAPITAL_RUTAS_SUBCOLLECTION,
    rutaId
  );

  await setDoc(
    snapshotRef,
    {
      rutaId,
      nombre: typeof data.nombre === "string" ? data.nombre : "",
      adminId: typeof data.adminId === "string" ? data.adminId : "",
      cajaRuta,
      cajasEmpleados,
      inversiones,
      ganancias,
      perdidas,
      capitalRuta,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}
