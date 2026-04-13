import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  REPORTES_DIA_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import { entregarReporteTrabajadorARuta } from "@/lib/entregar-reporte-empleado-admin";

/** POST: trabajador entrega a la base de la ruta el efectivo acumulado en su base / jornada. */
export async function POST(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores" }, { status: 403 });
  }

  const db = getAdminFirestore();
  try {
    const result = await entregarReporteTrabajadorARuta(db, apiUser.empresaId, apiUser.uid);
    if (result.monto <= 0) {
      return NextResponse.json({ error: "No hay monto que entregar" }, { status: 400 });
    }

    const rutaSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(apiUser.empresaId)
      .collection(RUTAS_SUBCOLLECTION)
      .doc(result.rutaId)
      .get();
    const adminId =
      rutaSnap.exists && typeof rutaSnap.data()?.adminId === "string"
        ? (rutaSnap.data()!.adminId as string)
        : "";

    const userSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
    const empleadoNombre =
      (userSnap.data()?.displayName as string | undefined)?.trim() || "—";

    const hoy = new Date();
    const fechaDia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

    await db
      .collection(EMPRESAS_COLLECTION)
      .doc(apiUser.empresaId)
      .collection(REPORTES_DIA_SUBCOLLECTION)
      .add({
        fecha: Timestamp.now(),
        fechaDia,
        rutaId: result.rutaId,
        empleadoId: apiUser.uid,
        empleadoNombre,
        montoEntregado: result.monto,
        adminId,
      });

    return NextResponse.json({
      ok: true,
      monto: result.monto,
      rutaId: result.rutaId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al entregar reporte";
    const status = msg.includes("No hay") || msg.includes("no coinciden") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
