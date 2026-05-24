import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import {
  crearSolicitudPrestamo,
  getMiSolicitudPrestamoPendiente,
  listSolicitudesPendientesAdmin,
  type SolicitudPrestamoDoc,
} from "@/lib/solicitud-prestamo-empleado";

function serializeSolicitud(s: SolicitudPrestamoDoc) {
  return {
    id: s.id,
    empleadoUid: s.empleadoUid,
    empleadoNombre: s.empleadoNombre,
    clienteId: s.clienteId,
    clienteNombre: s.clienteNombre,
    monto: s.monto,
    interes: s.interes,
    numeroCuotas: s.numeroCuotas,
    modalidad: s.modalidad,
    fechaInicio: s.fechaInicio,
    adminId: s.adminId,
    rutaId: s.rutaId,
    estado: s.estado,
    motivoRechazo: s.motivoRechazo,
    prestamoId: s.prestamoId,
    creadaEn: s.creadaEn?.toISOString() ?? null,
    resueltaEn: s.resueltaEn?.toISOString() ?? null,
  };
}

/** GET: admin — pendientes; empleado — su solicitud pendiente. */
export async function GET(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  try {
    if (apiUser.role === "admin") {
      const items = await listSolicitudesPendientesAdmin(db, apiUser.empresaId, apiUser.uid);
      return NextResponse.json({
        solicitudes: items.map(serializeSolicitud),
      });
    }
    if (apiUser.role === "empleado") {
      const pendiente = await getMiSolicitudPrestamoPendiente(
        db,
        apiUser.empresaId,
        apiUser.uid
      );
      return NextResponse.json({
        pendiente: pendiente ? serializeSolicitud(pendiente) : null,
      });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar solicitudes";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: empleado solicita un préstamo (requiere aprobación del admin). */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores pueden solicitar préstamos" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    clienteId?: string;
    monto?: number;
    interes?: number;
    numeroCuotas?: number;
    modalidad?: string;
    fechaInicio?: string;
  };

  const clienteId = body.clienteId?.trim();
  if (!clienteId) {
    return NextResponse.json({ error: "El cliente es obligatorio" }, { status: 400 });
  }
  if (typeof body.monto !== "number" || body.monto <= 0) {
    return NextResponse.json({ error: "Monto debe ser un número positivo" }, { status: 400 });
  }
  if (typeof body.numeroCuotas !== "number" || body.numeroCuotas < 1) {
    return NextResponse.json({ error: "Número de cuotas debe ser al menos 1" }, { status: 400 });
  }

  const modalidad =
    body.modalidad === "diario" || body.modalidad === "semanal" || body.modalidad === "mensual"
      ? body.modalidad
      : "mensual";
  const interes = typeof body.interes === "number" ? body.interes : 0;
  const fechaInicio =
    typeof body.fechaInicio === "string" && body.fechaInicio.trim()
      ? body.fechaInicio.trim()
      : new Date().toISOString().slice(0, 10);

  const db = getAdminFirestore();
  const montoSolicitud = body.monto;
  try {
    const { solicitudId, adminId } = await crearSolicitudPrestamo(db, apiUser.empresaId, apiUser.uid, {
      clienteId,
      monto: montoSolicitud,
      interes,
      numeroCuotas: body.numeroCuotas,
      modalidad,
      fechaInicio,
    });

    void (async () => {
      try {
        const { getAdminMessaging } = await import("@/lib/firebase-admin");
        const { notifyAdminSolicitudPrestamo } = await import("@/lib/fcm-notify-admin");
        const authSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
        const empleadoNombre =
          (typeof authSnap.data()?.displayName === "string" && authSnap.data()!.displayName.trim()) ||
          apiUser.uid;
        const clienteSnap = await db
          .collection(EMPRESAS_COLLECTION)
          .doc(apiUser.empresaId)
          .collection(CLIENTES_SUBCOLLECTION)
          .doc(clienteId)
          .get();
        const clienteNombre =
          (typeof clienteSnap.data()?.nombre === "string" && clienteSnap.data()!.nombre.trim()) ||
          "Cliente";
        await notifyAdminSolicitudPrestamo(getAdminMessaging(), {
          adminUid: adminId,
          empresaId: apiUser.empresaId,
          empleadoNombre,
          clienteNombre,
          monto: montoSolicitud,
          solicitudId,
        });
      } catch (e) {
        console.warn("[fcm] notify admin solicitud prestamo:", e);
      }
    })();

    return NextResponse.json({
      ok: true,
      solicitudId,
      mensaje: "Solicitud enviada. El administrador debe aprobarla para crear el préstamo.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear solicitud";
    const status =
      msg.includes("pendiente") ||
      msg.includes("moroso") ||
      msg.includes("préstamo activo") ||
      msg.includes("ruta") ||
      msg.includes("Cliente")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
