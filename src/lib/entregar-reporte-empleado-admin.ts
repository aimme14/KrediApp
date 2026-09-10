/**
 * Pasa el efectivo de la base del trabajador (`cajaEmpleado`) a la base de la ruta (`cajaRuta`).
 * capitalTotal no cambia.
 */

import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type EntregarReporteResult = {
  monto: number;
  rutaId: string;
};

/** Vista previa del efectivo que se movería al aprobar la entrega (sin mutar datos). */
export type PreviewEntregaReporte = {
  rutaId: string;
  rutaNombre: string;
  adminId: string;
  monto: number;
  empleadoNombre: string;
};

export async function getPreviewEntregaReporteTrabajador(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<PreviewEntregaReporte> {
  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const uSnap = await usuarioRef.get();
  if (!uSnap.exists) throw new Error("Usuario no encontrado");
  const ud = uSnap.data() as Record<string, unknown>;
  if ((ud.rol as string) !== "empleado") throw new Error("Solo aplica a trabajadores");
  const rutaId = typeof ud.rutaId === "string" ? ud.rutaId.trim() : "";
  if (!rutaId) throw new Error("No tienes ruta asignada");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const rutaSnap = await rutaRef.get();
  if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
  const rd = rutaSnap.data() as Record<string, unknown>;
  const adminId = typeof rd.adminId === "string" ? rd.adminId.trim() : "";
  const rutaNombre = typeof rd.nombre === "string" ? rd.nombre.trim() : "";

  const cEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;
  const monto = round2(cEmp);

  const authSnap = await db.collection(USERS_COLLECTION).doc(empleadoUid).get();
  const empleadoNombre =
    (authSnap.data()?.displayName as string | undefined)?.trim() || "—";

  return {
    rutaId,
    rutaNombre,
    adminId,
    monto,
    empleadoNombre,
  };
}

export async function entregarReporteTrabajadorARuta(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<EntregarReporteResult> {
  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const uSnap = await usuarioRef.get();
  if (!uSnap.exists) throw new Error("Usuario no encontrado");
  const ud = uSnap.data() as Record<string, unknown>;
  if ((ud.rol as string) !== "empleado") throw new Error("Solo aplica a trabajadores");
  const rutaId = typeof ud.rutaId === "string" ? ud.rutaId.trim() : "";
  if (!rutaId) throw new Error("No tienes ruta asignada");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  let montoEntregado = 0;

  await db.runTransaction(async (tx) => {
    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
    const rd = rutaSnap.data() as Record<string, unknown>;

    let cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
    let cajasEmpleados = typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
    const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
    const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;

    const now = new Date();

    const uSnapTx = await tx.get(usuarioRef);
    const udx = uSnapTx.data() as Record<string, unknown>;
    const cEmp = typeof udx?.cajaEmpleado === "number" ? udx.cajaEmpleado : 0;
    const monto = round2(cEmp);

    cajaRuta = round2(cajaRuta + monto);
    cajasEmpleados = round2(Math.max(0, cajasEmpleados - monto));
    const nuevoCapital = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });

    montoEntregado = monto;
    tx.update(usuarioRef, {
      cajaEmpleado: 0,
      ultimaActualizacionCapital: now,
    });
    tx.update(rutaRef, {
      cajaRuta,
      cajasEmpleados,
      capitalTotal: nuevoCapital,
      ultimaActualizacion: now,
    });
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }

  return { monto: montoEntregado, rutaId };
}

async function assertSolicitudPendienteEnTx(
  tx: Transaction,
  solRef: DocumentReference,
  adminUid: string
): Promise<void> {
  const solSnapTx = await tx.get(solRef);
  if (!solSnapTx.exists) throw new Error("Solicitud no encontrada");
  const solData = solSnapTx.data() as Record<string, unknown>;
  if (solData.estado !== "pendiente") throw new Error("La solicitud ya fue resuelta");
  if (solData.adminId !== adminUid) {
    throw new Error("No podés confirmar solicitudes de otra administración");
  }
}

/** Datos del cierre que se escriben en la solicitud al aprobarla. */
export type CierreSolicitudEntrega = {
  /** Id del reporte del día, pre-generado para que la solicitud nunca quede sin referencia. */
  reporteDiaId: string;
};

function marcarSolicitudAprobadaEnTx(
  tx: Transaction,
  solRef: DocumentReference,
  adminUid: string,
  monto: number,
  cierre: CierreSolicitudEntrega
): void {
  tx.update(solRef, {
    estado: "aprobada",
    resueltaEn: Timestamp.now(),
    resueltaPorUid: adminUid,
    montoEntregadoEfectivo: monto,
    reporteDiaId: cierre.reporteDiaId,
  });
}

/**
 * Cierra una solicitud legacy (el traspaso de efectivo ya se ejecutó al crearla)
 * validando y marcando aprobada en la misma transacción.
 */
export async function cerrarSolicitudEntregaLegacyEnTransaccion(
  db: Firestore,
  solRef: DocumentReference,
  adminUid: string,
  monto: number,
  cierre: CierreSolicitudEntrega
): Promise<void> {
  await db.runTransaction(async (tx) => {
    await assertSolicitudPendienteEnTx(tx, solRef, adminUid);
    marcarSolicitudAprobadaEnTx(tx, solRef, adminUid, monto, cierre);
  });
}

/**
 * Traspasa cajaEmpleado → cajaRuta y cierra la solicitud en la misma transacción.
 *
 * Marcar la solicitud como aprobada dentro de la transacción del dinero es lo
 * que impide que dos aprobaciones simultáneas generen dos cierres del día.
 */
export async function entregarReporteTrabajadorARutaConValidacion(
  db: Firestore,
  empresaId: string,
  empleadoUid: string,
  solRef: DocumentReference,
  adminUid: string,
  cierre: CierreSolicitudEntrega
): Promise<EntregarReporteResult> {
  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);

  const uSnap = await usuarioRef.get();
  if (!uSnap.exists) throw new Error("Usuario no encontrado");
  const ud = uSnap.data() as Record<string, unknown>;
  if ((ud.rol as string) !== "empleado") throw new Error("Solo aplica a trabajadores");
  const rutaId = typeof ud.rutaId === "string" ? ud.rutaId.trim() : "";
  if (!rutaId) throw new Error("No tienes ruta asignada");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  let montoEntregado = 0;

  await db.runTransaction(async (tx) => {
    await assertSolicitudPendienteEnTx(tx, solRef, adminUid);

    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
    const rd = rutaSnap.data() as Record<string, unknown>;

    let cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
    const cajasEmpleadosAntes =
      typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
    const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
    const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;

    const now = new Date();
    const uSnapTx = await tx.get(usuarioRef);
    const udx = uSnapTx.data() as Record<string, unknown>;
    const cEmp = typeof udx?.cajaEmpleado === "number" ? udx.cajaEmpleado : 0;
    const monto = round2(cEmp);

    cajaRuta = round2(cajaRuta + monto);

    // El trabajador entrega más de lo que la ruta tenía contabilizado en
    // `cajasEmpleados`. Truncar a cero mantiene la operación viva, pero el
    // faltante se deja registrado para que la auditoría lo vea.
    const cajasEmpleadosExacto = round2(cajasEmpleadosAntes - monto);
    const faltante = cajasEmpleadosExacto < -0.02 ? round2(-cajasEmpleadosExacto) : 0;
    const cajasEmpleados = round2(Math.max(0, cajasEmpleadosExacto));

    const nuevoCapital = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });

    montoEntregado = monto;

    tx.update(usuarioRef, {
      cajaEmpleado: 0,
      ultimaActualizacionCapital: now,
    });

    const rutaUpdate: Record<string, unknown> = {
      cajaRuta,
      cajasEmpleados,
      capitalTotal: nuevoCapital,
      ultimaActualizacion: now,
    };
    if (faltante > 0) {
      console.warn(
        `[entrega-reporte] Descuadre en ruta ${rutaId}: el trabajador ${empleadoUid} entregó ${monto} y cajasEmpleados era ${cajasEmpleadosAntes} (faltante ${faltante}).`
      );
      rutaUpdate.descuadreCajasEmpleados = {
        detectadoEn: now,
        faltante,
        empleadoUid,
        montoEntregado: monto,
        cajasEmpleadosAntes,
      };
    }
    tx.update(rutaRef, rutaUpdate);

    marcarSolicitudAprobadaEnTx(tx, solRef, adminUid, monto, cierre);
  });

  const after = await rutaRef.get();
  if (after.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, after.data()!);
  }

  return { monto: montoEntregado, rutaId };
}
