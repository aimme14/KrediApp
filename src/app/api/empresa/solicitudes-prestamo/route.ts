import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  USERS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  crearSolicitudPrestamo,
  getMiSolicitudPrestamoPendiente,
  listSolicitudesPendientesAdmin,
  type SolicitudPrestamoDoc,
} from "@/lib/solicitud-prestamo-empleado";
import {
  evaluarAprobacionPrestamoEmpleado,
  validarClienteElegibleParaPrestamo,
} from "@/lib/prestamo-aprobacion-empleado";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import {
  crearPrestamoEmpleado,
  mapCrearPrestamoEmpleadoError,
} from "@/lib/crear-prestamo-empleado";
import { validateFechaFinalRequired, resolveDiasCobroModoForCreate } from "@/lib/prestamo-fecha-final";
import { fechaDiaColombiaHoy } from "@/lib/colombia-day-bounds";

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
    fechaFinal: s.fechaFinal,
    diasCobroModo: s.diasCobroModo || null,
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
    if (isAdminPanelApiUser(apiUser)) {
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
    fechaFinal?: string;
    diasCobroModo?: string;
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
      ? body.fechaInicio.trim().slice(0, 10)
      : fechaDiaColombiaHoy();
  const fechaFinalVal = validateFechaFinalRequired(body.fechaFinal, fechaInicio);
  if (!fechaFinalVal.ok) {
    return NextResponse.json({ error: fechaFinalVal.error }, { status: 400 });
  }
  const fechaFinal = fechaFinalVal.ymd;
  const diasCobroVal = resolveDiasCobroModoForCreate(body.diasCobroModo);
  if (!diasCobroVal.ok) {
    return NextResponse.json({ error: diasCobroVal.error }, { status: 400 });
  }
  const diasCobroModoResolved = diasCobroVal.modo;

  const db = getAdminFirestore();
  const montoSolicitud = body.monto;

  const clienteSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId)
    .get();

  if (!clienteSnap.exists) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  try {
    validarClienteElegibleParaPrestamo(clienteSnap.data() as Record<string, unknown>);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cliente no elegible" },
      { status: 400 }
    );
  }

  const clienteNombre =
    (typeof clienteSnap.data()?.nombre === "string" && clienteSnap.data()!.nombre.trim()) ||
    "Cliente";

  try {
    const solicitudPendiente = await getMiSolicitudPrestamoPendiente(
      db,
      apiUser.empresaId,
      apiUser.uid
    );
    if (solicitudPendiente) {
      return NextResponse.json(
        {
          error:
            "Ya tienes una solicitud de préstamo pendiente. Espera la respuesta del administrador.",
        },
        { status: 400 }
      );
    }

    const evaluacion = await evaluarAprobacionPrestamoEmpleado(
      db,
      apiUser.empresaId,
      clienteId,
      montoSolicitud
    );

    if (!evaluacion.requiereAprobacionAdmin) {
      const usuarioRef = db
        .collection(EMPRESAS_COLLECTION)
        .doc(apiUser.empresaId)
        .collection(USUARIOS_SUBCOLLECTION)
        .doc(apiUser.uid);
      const uSnap = await usuarioRef.get();
      if (!uSnap.exists) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 400 });
      }
      const ud = uSnap.data() as Record<string, unknown>;
      const rutaId = typeof ud.rutaId === "string" ? ud.rutaId.trim() : "";
      if (!rutaId) {
        return NextResponse.json({ error: "No tienes ruta asignada" }, { status: 400 });
      }

      const rutaSnap = await db
        .collection(EMPRESAS_COLLECTION)
        .doc(apiUser.empresaId)
        .collection(RUTAS_SUBCOLLECTION)
        .doc(rutaId)
        .get();
      if (!rutaSnap.exists) {
        return NextResponse.json({ error: "Ruta no encontrada" }, { status: 400 });
      }
      const adminId =
        typeof rutaSnap.data()?.adminId === "string"
          ? rutaSnap.data()!.adminId.trim()
          : "";
      if (!adminId) {
        return NextResponse.json({ error: "La ruta no tiene administrador" }, { status: 400 });
      }

      const { prestamoId } = await crearPrestamoEmpleado(db, {
        empresaId: apiUser.empresaId,
        empleadoUid: apiUser.uid,
        adminId,
        rutaId,
        clienteId,
        clienteNombre,
        monto: montoSolicitud,
        interes,
        modalidad,
        numeroCuotas: body.numeroCuotas,
        fechaInicio,
        fechaFinal,
        diasCobroModo: diasCobroModoResolved,
        aprobacionTipo: "automatica",
        aprobadoPorAdmin: null,
        montoUltimoPrestamoReferencia: evaluacion.montoUltimoPrestamo,
      });

      void (async () => {
        try {
          const { getAdminMessaging } = await import("@/lib/firebase-admin");
          const { notifyAdminPrestamoEmpleado } = await import("@/lib/fcm-notify-admin");
          const authSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
          const empleadoNombre =
            (typeof authSnap.data()?.displayName === "string" &&
              authSnap.data()!.displayName.trim()) ||
            apiUser.uid;
          await notifyAdminPrestamoEmpleado(getAdminMessaging(), {
            adminUid: adminId,
            empresaId: apiUser.empresaId,
            empleadoNombre,
            clienteNombre,
            monto: montoSolicitud,
            prestamoId,
          });
        } catch (e) {
          console.warn("[fcm] notify admin prestamo auto:", e);
        }
      })();

      return NextResponse.json({
        ok: true,
        tipo: "prestamo_creado",
        prestamoId,
        requiereAprobacionAdmin: false,
        montoUltimoPrestamo: evaluacion.montoUltimoPrestamo,
        mensaje: "Préstamo creado correctamente.",
      });
    }

    const { solicitudId, adminId } = await crearSolicitudPrestamo(db, apiUser.empresaId, apiUser.uid, {
      clienteId,
      monto: montoSolicitud,
      interes,
      numeroCuotas: body.numeroCuotas,
      modalidad,
      fechaInicio,
      fechaFinal,
      diasCobroModo: diasCobroModoResolved,
    });

    void (async () => {
      try {
        const { getAdminMessaging } = await import("@/lib/firebase-admin");
        const { notifyAdminSolicitudPrestamo } = await import("@/lib/fcm-notify-admin");
        const authSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
        const empleadoNombre =
          (typeof authSnap.data()?.displayName === "string" && authSnap.data()!.displayName.trim()) ||
          apiUser.uid;
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
      tipo: "solicitud",
      solicitudId,
      requiereAprobacionAdmin: true,
      montoUltimoPrestamo: evaluacion.montoUltimoPrestamo,
      motivo: evaluacion.motivo,
      mensaje: "Solicitud enviada. El administrador debe aprobarla para crear el préstamo.",
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Error al procesar préstamo";
    const msg = mapCrearPrestamoEmpleadoError(raw);
    const status =
      msg.includes("pendiente") ||
      msg.includes("moroso") ||
      msg.includes("préstamo activo") ||
      msg.includes("ruta") ||
      msg.includes("Cliente") ||
      msg.includes("saldo") ||
      msg.includes("caja") ||
      msg.includes("Capital") ||
      msg.includes("descuadrado") ||
      msg.includes("Trabajador")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
