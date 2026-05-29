import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  SOLICITUDES_PRESTAMO_SUBCOLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";

export type EstadoSolicitudPrestamo = "pendiente" | "aprobada" | "rechazada";

export type SolicitudPrestamoDoc = {
  id: string;
  empleadoUid: string;
  empleadoNombre: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  interes: number;
  numeroCuotas: number;
  modalidad: string;
  fechaInicio: string;
  adminId: string;
  rutaId: string;
  estado: EstadoSolicitudPrestamo;
  motivoRechazo: string | null;
  prestamoId: string | null;
  creadaEn: Date | null;
  resueltaEn: Date | null;
};

function mapSolicitud(id: string, data: Record<string, unknown>): SolicitudPrestamoDoc {
  const creada = data.creadaEn as { toDate?: () => Date } | undefined;
  const resuelta = data.resueltaEn as { toDate?: () => Date } | undefined;
  return {
    id,
    empleadoUid: typeof data.empleadoUid === "string" ? data.empleadoUid : "",
    empleadoNombre: typeof data.empleadoNombre === "string" ? data.empleadoNombre : "",
    clienteId: typeof data.clienteId === "string" ? data.clienteId : "",
    clienteNombre: typeof data.clienteNombre === "string" ? data.clienteNombre : "",
    monto: typeof data.monto === "number" ? data.monto : 0,
    interes: typeof data.interes === "number" ? data.interes : 0,
    numeroCuotas: typeof data.numeroCuotas === "number" ? data.numeroCuotas : 0,
    modalidad: typeof data.modalidad === "string" ? data.modalidad : "mensual",
    fechaInicio: typeof data.fechaInicio === "string" ? data.fechaInicio : "",
    adminId: typeof data.adminId === "string" ? data.adminId : "",
    rutaId: typeof data.rutaId === "string" ? data.rutaId : "",
    estado: (data.estado as EstadoSolicitudPrestamo) ?? "pendiente",
    motivoRechazo: typeof data.motivoRechazo === "string" ? data.motivoRechazo : null,
    prestamoId: typeof data.prestamoId === "string" ? data.prestamoId : null,
    creadaEn: creada?.toDate?.() ?? null,
    resueltaEn: resuelta?.toDate?.() ?? null,
  };
}

export async function crearSolicitudPrestamo(
  db: Firestore,
  empresaId: string,
  empleadoUid: string,
  params: {
    clienteId: string;
    monto: number;
    interes: number;
    numeroCuotas: number;
    modalidad: string;
    fechaInicio: string;
  }
): Promise<{ solicitudId: string; adminId: string }> {
  const existing = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .where("empleadoUid", "==", empleadoUid)
    .where("estado", "==", "pendiente")
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error("Ya tienes una solicitud de préstamo pendiente. Espera la respuesta del administrador.");
  }

  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(empleadoUid);
  const uSnap = await usuarioRef.get();
  if (!uSnap.exists) throw new Error("Usuario no encontrado");
  const ud = uSnap.data() as Record<string, unknown>;
  const rutaId = typeof ud.rutaId === "string" ? ud.rutaId.trim() : "";
  if (!rutaId) throw new Error("No tienes ruta asignada");

  const rutaSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId)
    .get();
  if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
  const adminId = typeof rutaSnap.data()?.adminId === "string"
    ? rutaSnap.data()!.adminId.trim() : "";
  if (!adminId) throw new Error("La ruta no tiene administrador");

  const authSnap = await db.collection(USERS_COLLECTION).doc(empleadoUid).get();
  const empleadoNombre = (authSnap.data()?.displayName as string)?.trim() || "—";

  const clienteSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(params.clienteId)
    .get();

  if (!clienteSnap.exists) throw new Error("Cliente no encontrado");
  const clienteData = clienteSnap.data() as Record<string, unknown>;
  if (clienteData.moroso === true) {
    throw new Error("No se puede solicitar préstamo para un cliente moroso");
  }
  if (clienteData.prestamo_activo === true) {
    throw new Error("El cliente ya tiene un préstamo activo");
  }
  const clienteNombre = typeof clienteData.nombre === "string"
    ? clienteData.nombre.trim() : "—";

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .doc();

  await ref.set({
    empleadoUid,
    empleadoNombre,
    clienteId: params.clienteId,
    clienteNombre,
    monto: params.monto,
    interes: params.interes,
    numeroCuotas: params.numeroCuotas,
    modalidad: params.modalidad,
    fechaInicio: params.fechaInicio,
    adminId,
    rutaId,
    estado: "pendiente" as EstadoSolicitudPrestamo,
    motivoRechazo: null,
    prestamoId: null,
    creadaEn: Timestamp.now(),
    resueltaEn: null,
  });

  return { solicitudId: ref.id, adminId };
}

export async function aprobarSolicitudPrestamo(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  solicitudId: string
): Promise<{ prestamoId: string }> {
  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .doc(solicitudId);

  const solSnap = await solRef.get();
  if (!solSnap.exists) throw new Error("Solicitud no encontrada");
  const sol = solSnap.data() as Record<string, unknown>;
  if (sol.estado !== "pendiente") throw new Error("La solicitud ya fue resuelta");
  if (sol.adminId !== adminUid) throw new Error("No puedes aprobar solicitudes de otra administración");

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc();

  const monto = typeof sol.monto === "number" ? sol.monto : 0;
  const interes = typeof sol.interes === "number" ? sol.interes : 0;
  const numeroCuotas = typeof sol.numeroCuotas === "number" ? sol.numeroCuotas : 1;
  const totalAPagar = Math.round(monto * (1 + interes / 100) * 100) / 100;

  const now = Timestamp.now();
  await db.runTransaction(async (tx) => {
    tx.set(prestamoRef, {
      clienteId: sol.clienteId,
      clienteNombre: sol.clienteNombre,
      empleadoId: sol.empleadoUid,
      adminId: adminUid,
      rutaId: sol.rutaId,
      monto,
      interes,
      numeroCuotas,
      modalidad: sol.modalidad,
      fechaInicio: sol.fechaInicio,
      totalAPagar,
      saldoPendiente: totalAPagar,
      estado: "activo",
      adelantoCuota: 0,
      intentosFallidos: 0,
      creadoEn: now,
      updatedAt: now,
    });

    const clienteRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(CLIENTES_SUBCOLLECTION)
      .doc(sol.clienteId as string);
    tx.update(clienteRef, { prestamo_activo: true });

    tx.update(solRef, {
      estado: "aprobada" as EstadoSolicitudPrestamo,
      prestamoId: prestamoRef.id,
      resueltaEn: now,
      resueltaPorUid: adminUid,
    });
  });

  return { prestamoId: prestamoRef.id };
}

export async function rechazarSolicitudPrestamo(
  db: Firestore,
  empresaId: string,
  adminUid: string,
  solicitudId: string,
  motivoRechazo: string | null
): Promise<void> {
  const solRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .doc(solicitudId);

  const solSnap = await solRef.get();
  if (!solSnap.exists) throw new Error("Solicitud no encontrada");
  const sol = solSnap.data() as Record<string, unknown>;
  if (sol.estado !== "pendiente") throw new Error("La solicitud ya fue resuelta");
  if (sol.adminId !== adminUid) throw new Error("No puedes rechazar solicitudes de otra administración");

  await solRef.update({
    estado: "rechazada" as EstadoSolicitudPrestamo,
    motivoRechazo: motivoRechazo?.trim() || null,
    resueltaEn: Timestamp.now(),
    resueltaPorUid: adminUid,
  });
}

export async function listSolicitudesPendientesAdmin(
  db: Firestore,
  empresaId: string,
  adminUid: string
): Promise<SolicitudPrestamoDoc[]> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .where("adminId", "==", adminUid)
    .where("estado", "==", "pendiente")
    .get();

  return snap.docs
    .map((d) => mapSolicitud(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.creadaEn?.getTime() ?? 0) - (a.creadaEn?.getTime() ?? 0));
}

export async function getMiSolicitudPrestamoPendiente(
  db: Firestore,
  empresaId: string,
  empleadoUid: string
): Promise<SolicitudPrestamoDoc | null> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .where("empleadoUid", "==", empleadoUid)
    .where("estado", "==", "pendiente")
    .limit(1)
    .get();

  const d = snap.docs[0];
  if (!d) return null;
  return mapSolicitud(d.id, d.data() as Record<string, unknown>);
}
