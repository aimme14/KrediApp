import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminMessaging } from "@/lib/firebase-admin";
import { notifyAdminCuotaPrestamo } from "@/lib/fcm-notify-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  computeRutaCamposTrasCobroPrestamoCobroEnEmpleado,
  computeRutaCamposTrasPerdidaPrestamo,
  splitMontoPagoEnCapitalYGanancia,
  round2,
  snapPesoCOP,
} from "@/lib/ruta-financiera-admin";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { recordCreditMovement } from "@/lib/financial-ledger";
import {
  startIdempotentOperation,
  finishIdempotentOperation,
} from "@/lib/financial-idempotency";
import {
  estadoTrasNoPago,
  normalizeEstadoPrestamo,
  resolverEstadoTrasMovimiento,
} from "@/lib/prestamo-estado";
import type { EstadoPrestamo } from "@/types/firestore";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

const MOTIVOS_NO_PAGO = ["sin_fondos", "no_estaba", "promesa_pago", "otro"] as const;
const MOTIVOS_PERDIDA = [
  "imposible_cobrar",
  "cliente_perdido",
  "acuerdo_quita",
  "otro",
] as const;
const MAX_PAGOS_LIST = 50;

/** Campos de auditoría y collectionGroup en todos los pagos, sin importar el rol. */
function buildCamposAuditoria(params: {
  adminId: string;
  empresaId: string;
  prestamoId: string;
  rutaId: string;
  clienteId: string;
  clienteNombre: string;
  rutaNombre: string;
  cobradoPorRol: string;
}): Record<string, unknown> {
  return {
    adminId: params.adminId,
    empresaId: params.empresaId,
    prestamoId: params.prestamoId,
    rutaId: params.rutaId,
    clienteId: params.clienteId,
    clienteNombre: params.clienteNombre,
    rutaNombre: params.rutaNombre,
    cobradoPorRol: params.cobradoPorRol,
    estado: "activo" as const,
  };
}

function rutaNombreDesdeSnap(
  snap: FirebaseFirestore.DocumentSnapshot | null | undefined
): string {
  if (!snap?.exists) return "";
  const nombre = snap.data()?.nombre;
  return typeof nombre === "string" ? nombre.trim() : "";
}

async function resolveClienteNombre(
  db: Firestore,
  empresaId: string,
  clienteId: string
): Promise<string> {
  const cid = clienteId.trim();
  if (!cid) return "—";
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(cid);
  const s = await ref.get();
  if (!s.exists) return "—";
  const n = (s.data() as Record<string, unknown>)?.nombre;
  return typeof n === "string" && n.trim() ? n.trim() : "—";
}

/** Solo cuando el registro lo hace un empleado; no bloquea la respuesta HTTP. */
function scheduleFcmCuotaToAdminIfEmpleado(params: {
  db: Firestore;
  apiUser: { uid: string; empresaId: string; role: string; adminId?: string };
  prestamoFlat: Record<string, unknown>;
  prestamoId: string;
  tipoRegistro: "pago" | "no_pago" | "perdida";
  pagoId: string;
  monto?: number;
  motivoCodigo?: string;
  metodoPago?: "efectivo" | "transferencia";
}): void {
  if (params.apiUser.role !== "empleado") return;
  const adminUid =
    (typeof params.prestamoFlat.adminId === "string"
      ? params.prestamoFlat.adminId.trim()
      : "") ||
    (typeof params.apiUser.adminId === "string" ? params.apiUser.adminId.trim() : "");
  if (!adminUid) {
    console.warn(
      "[pagos] Préstamo sin adminId; no se envía FCM de cuota al administrador."
    );
    return;
  }
  const clienteId =
    typeof params.prestamoFlat.clienteId === "string"
      ? params.prestamoFlat.clienteId.trim()
      : "";
  const clienteNombreDirecto =
    typeof params.prestamoFlat.clienteNombre === "string" &&
    params.prestamoFlat.clienteNombre.trim()
      ? params.prestamoFlat.clienteNombre.trim()
      : null;
  void (async () => {
    try {
      const clienteNombre =
        clienteNombreDirecto ??
        (await resolveClienteNombre(
          params.db,
          params.apiUser.empresaId,
          clienteId
        ));
      await notifyAdminCuotaPrestamo(getAdminMessaging(), {
        adminUid,
        empresaId: params.apiUser.empresaId,
        prestamoId: params.prestamoId,
        pagoId: params.pagoId,
        clienteNombre,
        clienteId,
        tipoRegistro: params.tipoRegistro,
        monto: params.monto,
        motivoCodigo: params.motivoCodigo,
        metodoPago: params.metodoPago,
      });
    } catch (e) {
      console.warn("[pagos] FCM cuota admin:", e);
    }
  })();
}

/** GET: listar últimos pagos del préstamo (para historial). Empleado o admin de la ruta/empresa. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: prestamoId } = await params;
  const db = getAdminFirestore();
  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId);

  const prestamoSnap = await prestamoRef.get();
  if (!prestamoSnap.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }

  const data = prestamoSnap.data()!;
  if (apiUser.role === "empleado" && apiUser.rutaId && data.rutaId !== apiUser.rutaId) {
    return NextResponse.json({ error: "No puedes ver pagos de préstamos de otra ruta" }, { status: 403 });
  }
  if (apiUser.role !== "empleado" && data.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes ver este préstamo" }, { status: 403 });
  }

  const pagosSnap = await prestamoRef
    .collection(PAGOS_SUBCOLLECTION)
    .orderBy("fecha", "desc")
    .limit(MAX_PAGOS_LIST)
    .get();

  const pagos = pagosSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      monto: d.monto ?? 0,
      fecha: d.fecha?.toDate?.()?.toISOString() ?? null,
      tipo: d.tipo ?? "pago",
      metodoPago: d.metodoPago ?? null,
      motivoNoPago: typeof d.motivoNoPago === "string" ? d.motivoNoPago : null,
      motivoPerdida: typeof d.motivoPerdida === "string" ? d.motivoPerdida : null,
      registradoPorUid: d.registradoPorUid ?? d.empleadoId ?? null,
      registradoPorNombre: d.registradoPorNombre ?? null,
      estado: d.estado ?? "activo",
    };
  });

  return NextResponse.json({ pagos });
}

/** POST: registrar un pago (cobro) o un intento sin pago. Empleado o admin. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: prestamoId } = await params;
  const body = await request.json();
  const {
    tipo,
    monto,
    metodoPago,
    evidencia,
    motivoNoPago,
    motivoPerdida,
    nota,
    registradoPorUid,
    registradoPorNombre,
    idempotencyKey,
  } = body as {
    tipo?: "pago" | "no_pago" | "perdida";
    monto?: number;
    metodoPago?: "efectivo" | "transferencia";
    evidencia?: string;
    motivoNoPago?: string;
    motivoPerdida?: string;
    nota?: string;
    registradoPorUid?: string;
    registradoPorNombre?: string;
    idempotencyKey?: string;
  };
  const uidRegistro = (registradoPorUid ?? apiUser.uid).trim() ? (registradoPorUid ?? apiUser.uid).trim() : apiUser.uid;
  const nombreRegistro = (registradoPorNombre ?? "").trim() || null;

  const db = getAdminFirestore();
  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId);

  const prestamoSnap = await prestamoRef.get();
  if (!prestamoSnap.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }

  const data = prestamoSnap.data()!;
  if (apiUser.role === "empleado" && apiUser.rutaId && data.rutaId !== apiUser.rutaId) {
    return NextResponse.json({ error: "No puedes registrar en préstamos de otra ruta" }, { status: 403 });
  }
  if (apiUser.role !== "empleado" && data.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes registrar en este préstamo" }, { status: 403 });
  }

  const now = new Date();
  const idem = await startIdempotentOperation({
    db,
    empresaId: apiUser.empresaId,
    key: idempotencyKey,
    endpoint: `prestamos:${prestamoId}:pagos`,
    uid: apiUser.uid,
  });
  if (idem.replay) {
    return NextResponse.json(idem.payload, { status: idem.status });
  }

  const finalize = async (status: number, payload: Record<string, unknown>) => {
    await finishIdempotentOperation({
      db,
      empresaId: apiUser.empresaId,
      key: idempotencyKey,
      result: { ok: status < 400, status, payload },
    });
    return NextResponse.json(payload, { status });
  };

  const adminIdPrestamo =
    typeof data.adminId === "string" && data.adminId.trim()
      ? data.adminId.trim()
      : apiUser.uid;
  const clienteIdPrestamo =
    typeof data.clienteId === "string" ? data.clienteId.trim() : "";
  let clienteNombrePrestamo =
    typeof data.clienteNombre === "string" && data.clienteNombre.trim()
      ? data.clienteNombre.trim()
      : "";
  const rutaIdPrestamoData =
    typeof data.rutaId === "string" ? data.rutaId.trim() : "";

  if (!clienteNombrePrestamo && clienteIdPrestamo) {
    clienteNombrePrestamo = await resolveClienteNombre(
      db,
      apiUser.empresaId,
      clienteIdPrestamo
    );
  }

  if (tipo === "no_pago") {
    const motivo =
      motivoNoPago && MOTIVOS_NO_PAGO.includes(motivoNoPago as (typeof MOTIVOS_NO_PAGO)[number])
        ? (motivoNoPago as (typeof MOTIVOS_NO_PAGO)[number])
        : "otro";

    let pagoIdNoPago: string;
    try {
      pagoIdNoPago = await db.runTransaction(async (tx) => {
        const prSnap = await tx.get(prestamoRef);
        if (!prSnap.exists) {
          throw new Error("PRESTAMO_NOT_FOUND");
        }
        const pr = prSnap.data()!;

        let rutaNombreNoPago = "";
        if (rutaIdPrestamoData) {
          const rutaRef = db
            .collection(EMPRESAS_COLLECTION)
            .doc(apiUser.empresaId)
            .collection(RUTAS_SUBCOLLECTION)
            .doc(rutaIdPrestamoData);
          const rSnap = await tx.get(rutaRef);
          rutaNombreNoPago = rutaNombreDesdeSnap(rSnap);
        }

        const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc();
        tx.set(pagoRef, {
          monto: 0,
          fecha: now,
          empleadoId: apiUser.uid,
          tipo: "no_pago",
          motivoNoPago: motivo,
          nota: (nota ?? "").trim() || null,
          registradoPorUid: uidRegistro,
          registradoPorNombre: nombreRegistro,
          ...buildCamposAuditoria({
            adminId: adminIdPrestamo,
            empresaId: apiUser.empresaId,
            prestamoId,
            rutaId: rutaIdPrestamoData,
            clienteId: clienteIdPrestamo,
            clienteNombre: clienteNombrePrestamo,
            rutaNombre: rutaNombreNoPago,
            cobradoPorRol: apiUser.role,
          }),
        });

        const prevFallos =
          typeof pr.intentosFallidos === "number" ? pr.intentosFallidos : 0;
        const intentosFallidos = prevFallos + 1;
        const estadoPrestamo = estadoTrasNoPago(pr.estado);

        tx.update(prestamoRef, {
          intentosFallidos,
          estado: estadoPrestamo,
          updatedAt: now,
        });
        return pagoRef.id;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "PRESTAMO_NOT_FOUND") {
        return finalize(404, { error: "Préstamo no encontrado" });
      }
      return finalize(400, { error: msg || "No se pudo registrar el no pago" });
    }

    scheduleFcmCuotaToAdminIfEmpleado({
      db,
      apiUser,
      prestamoFlat: data as Record<string, unknown>,
      prestamoId,
      tipoRegistro: "no_pago",
      pagoId: pagoIdNoPago,
      motivoCodigo: motivo,
    });

    return finalize(200, { ok: true, tipo: "no_pago" });
  }

  if (tipo === "perdida") {
    if (apiUser.role === "empleado") {
      return finalize(403, {
        error: "Solo el administrador puede registrar pérdidas",
      });
    }

    const rawMonto =
      typeof monto === "number" ? monto : Number(String(monto ?? "").replace(/,/g, ""));
    if (Number.isNaN(rawMonto) || rawMonto <= 0) {
      return finalize(400, { error: "Monto debe ser un número positivo" });
    }

    const motivoP =
      motivoPerdida && MOTIVOS_PERDIDA.includes(motivoPerdida as (typeof MOTIVOS_PERDIDA)[number])
        ? (motivoPerdida as (typeof MOTIVOS_PERDIDA)[number])
        : "otro";

    try {
      const result = await db.runTransaction(async (tx) => {
        const prestamoSnap = await tx.get(prestamoRef);
        if (!prestamoSnap.exists) {
          throw new Error("PRESTAMO_NOT_FOUND");
        }
        const d = prestamoSnap.data()!;

        const saldoPendiente = round2((d.saldoPendiente as number) ?? 0);
        if (saldoPendiente <= 0) {
          throw new Error("SIN_SALDO_APLICABLE");
        }
        const totalAPagar = (d.totalAPagar as number) ?? 0;
        const montoPrestamo = (d.monto as number) ?? 0;

        const montoAplicar = saldoPendiente;
        const nuevoSaldo = 0;
        const adelantoParaGuardar = 0;
        const cobradoAcumulado = round2(totalAPagar - saldoPendiente);

        const rutaIdPrestamo = typeof d.rutaId === "string" ? d.rutaId.trim() : "";

        const rutaRef =
          rutaIdPrestamo && montoAplicar > 0
            ? db
                .collection(EMPRESAS_COLLECTION)
                .doc(apiUser.empresaId)
                .collection(RUTAS_SUBCOLLECTION)
                .doc(rutaIdPrestamo)
            : null;

        /** Todas las lecturas antes de cualquier escritura (requisito de Firestore). */
        let rutaSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        if (rutaRef) {
          rutaSnap = await tx.get(rutaRef);
          if (!rutaSnap.exists) {
            throw new Error("RUTA_NOT_FOUND");
          }
        }

        const nowTx = new Date();
        const gananciaTotal = round2(totalAPagar - montoPrestamo);
        const gananciaAcumulada = round2(cobradoAcumulado * (gananciaTotal / totalAPagar));
        const capitalNoRecuperado =
          cobradoAcumulado < montoPrestamo
            ? round2(montoPrestamo - cobradoAcumulado)
            : 0;

        const parteCapitalPerdida = Math.min(
          round2(capitalNoRecuperado + gananciaAcumulada),
          typeof rutaSnap?.data()?.inversiones === "number"
            ? (rutaSnap.data()!.inversiones as number)
            : 0
        );
        const parteGananciaPerdida = gananciaAcumulada;

        const rutaNombrePerdida = rutaNombreDesdeSnap(rutaSnap);

        const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc();
        tx.set(pagoRef, {
          monto: montoAplicar,
          fecha: nowTx,
          empleadoId: apiUser.uid,
          tipo: "perdida",
          motivoPerdida: motivoP,
          nota: (nota ?? "").trim() || null,
          registradoPorUid: uidRegistro,
          registradoPorNombre: nombreRegistro,
          parteCapitalPerdida,
          parteGananciaPerdida,
          cobradoAcumulado,
          ...buildCamposAuditoria({
            adminId: adminIdPrestamo,
            empresaId: apiUser.empresaId,
            prestamoId,
            rutaId: rutaIdPrestamo,
            clienteId: clienteIdPrestamo,
            clienteNombre: clienteNombrePrestamo,
            rutaNombre: rutaNombrePerdida,
            cobradoPorRol: apiUser.role,
          }),
        });

        const resolucionPerdida = resolverEstadoTrasMovimiento({
          tipo: "perdida",
          nuevoSaldo,
        });

        tx.update(prestamoRef, {
          saldoPendiente: nuevoSaldo,
          estado: resolucionPerdida.estado,
          updatedAt: nowTx,
          adelantoCuota: adelantoParaGuardar,
          totalCastigado: FieldValue.increment(capitalNoRecuperado),
          cobradoAcumulado,
          ...(resolucionPerdida.cierraPrestamo
            ? { fechaCierre: nowTx, cerradoPor: resolucionPerdida.cerradoPor }
            : {}),
        });

        if (rutaRef && rutaSnap?.exists) {
          const rutaUpd = computeRutaCamposTrasPerdidaPrestamo(
            rutaSnap.data() as Record<string, unknown>,
            saldoPendiente,
            montoPrestamo,
            totalAPagar,
            cobradoAcumulado
          );
          tx.update(rutaRef, {
            inversiones: rutaUpd.inversiones,
            ganancias: rutaUpd.ganancias,
            perdidas: rutaUpd.perdidas,
            capitalTotal: rutaUpd.capitalTotal,
            ultimaActualizacion: nowTx,
          });
        }

        const clienteId = d.clienteId as string;
        if (clienteId?.trim()) {
          const clienteRef = db
            .collection(EMPRESAS_COLLECTION)
            .doc(apiUser.empresaId)
            .collection(CLIENTES_SUBCOLLECTION)
            .doc(clienteId.trim());
          tx.update(clienteRef, { prestamo_activo: false });
        }

        return {
          saldoPendiente: nuevoSaldo,
          adelantoCuota: adelantoParaGuardar,
          rutaId: rutaIdPrestamo || null,
          pagoId: pagoRef.id,
          montoAplicar,
          estado: resolucionPerdida.estado,
        };
      });

      if (result.rutaId) {
        const rutaRef = db
          .collection(EMPRESAS_COLLECTION)
          .doc(apiUser.empresaId)
          .collection(RUTAS_SUBCOLLECTION)
          .doc(result.rutaId);
        const rutaAfter = await rutaRef.get();
        if (rutaAfter.exists) {
          await upsertCapitalRutaSnapshot(
            db,
            apiUser.empresaId,
            result.rutaId,
            rutaAfter.data()!
          );
        }
      }

      if (result.saldoPendiente <= 0) {
        const adminUidPrestamo =
          typeof data.adminId === "string" ? data.adminId.trim() : "";
        if (adminUidPrestamo) {
          void db
            .collection(EMPRESAS_COLLECTION)
            .doc(apiUser.empresaId)
            .collection(USUARIOS_SUBCOLLECTION)
            .doc(adminUidPrestamo)
            .set(
              { totalPrestamosActivos: FieldValue.increment(-1) },
              { merge: true }
            );
        }
      }

      scheduleFcmCuotaToAdminIfEmpleado({
        db,
        apiUser,
        prestamoFlat: data as Record<string, unknown>,
        prestamoId,
        tipoRegistro: "perdida",
        pagoId: result.pagoId,
        monto: result.montoAplicar,
        motivoCodigo: motivoP,
      });

      return finalize(200, {
        ok: true,
        tipo: "perdida",
        saldoPendiente: result.saldoPendiente,
        adelantoCuota: result.adelantoCuota,
        estado: result.estado,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "PRESTAMO_NOT_FOUND") {
        return finalize(404, { error: "Préstamo no encontrado" });
      }
      if (msg === "SIN_SALDO_APLICABLE") {
        return finalize(400, { error: "No hay saldo pendiente para registrar la pérdida" });
      }
      if (msg === "RUTA_NOT_FOUND") {
        return finalize(400, { error: "Ruta del préstamo no encontrada" });
      }
      return finalize(400, { error: msg || "No se pudo registrar la pérdida" });
    }
  }

  if (typeof monto !== "number" || monto <= 0) {
    return finalize(400, { error: "Monto debe ser un número positivo" });
  }
  const metodo = metodoPago === "transferencia" ? "transferencia" : "efectivo";
  const evidenciaTrim = typeof evidencia === "string" ? evidencia.trim() : "";
  if (metodo === "transferencia") {
    if (!evidenciaTrim) {
      return finalize(400, { error: "Transferencia requiere evidencia (1 foto)" });
    }
    if (evidenciaTrim.includes(",")) {
      return finalize(400, { error: "Solo se permite 1 foto de evidencia" });
    }
  }

  const prestamoPreRead = await prestamoRef.get();
  if (!prestamoPreRead.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }
  const keyTrimmed = typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";

  try {
    const result = await db.runTransaction(async (tx) => {
      const prestamoSnap = await tx.get(prestamoRef);
      if (!prestamoSnap.exists) {
        throw new Error("PRESTAMO_NOT_FOUND");
      }
      const d = prestamoSnap.data()!;

      const saldoPendiente = (d.saldoPendiente as number) ?? 0;
      const montoAplicar = Math.min(monto, saldoPendiente);
      if (montoAplicar <= 0) {
        throw new Error("SIN_SALDO_APLICABLE");
      }
      const nuevoSaldo = Math.round((saldoPendiente - montoAplicar) * 100) / 100;

      const totalAPagar = (d.totalAPagar as number) ?? 0;
      const numeroCuotas = (d.numeroCuotas as number) ?? 0;
      const valorCuota = numeroCuotas > 0 ? totalAPagar / numeroCuotas : 0;
      const adelantoActual = (d.adelantoCuota as number) ?? 0;
      const totalDisponible = montoAplicar + adelantoActual;
      const cuotasCubiertas = valorCuota > 0 ? Math.floor(totalDisponible / valorCuota) : 0;
      const adelantoNuevo =
        valorCuota > 0
          ? Math.round((totalDisponible - cuotasCubiertas * valorCuota) * 100) / 100
          : 0;
      const adelantoParaGuardar = nuevoSaldo <= 0 ? 0 : adelantoNuevo;

      const montoPrestamo = (d.monto as number) ?? 0;
      const rutaIdPrestamo = typeof d.rutaId === "string" ? d.rutaId.trim() : "";
      const estadoPrestamoAntes = normalizeEstadoPrestamo(d.estado);

      const nowTx = new Date();
      const cobradoAcumuladoAntes = round2(totalAPagar - saldoPendiente);
      const { capital: parteCapital, ganancia: parteGanancia } =
        splitMontoPagoEnCapitalYGanancia(
          montoAplicar,
          montoPrestamo,
          totalAPagar,
          cobradoAcumuladoAntes
        );

      /**
       * Efectivo: admin → cajaRuta; empleado → cajaEmpleado del cobrador.
       * Transferencia: siempre cajaRuta (no pasa por el bolsillo del empleado).
       */
      const acreditaCajaRuta = isAdminPanelApiUser(apiUser) || metodo === "transferencia";
      const cobradorEmpleadoUid = acreditaCajaRuta ? null : apiUser.uid;
      const usuarioEmpRef = cobradorEmpleadoUid
        ? db
            .collection(EMPRESAS_COLLECTION)
            .doc(apiUser.empresaId)
            .collection(USUARIOS_SUBCOLLECTION)
            .doc(cobradorEmpleadoUid)
        : null;

      const rutaRef =
        rutaIdPrestamo && montoAplicar > 0
          ? db
              .collection(EMPRESAS_COLLECTION)
              .doc(apiUser.empresaId)
              .collection(RUTAS_SUBCOLLECTION)
              .doc(rutaIdPrestamo)
          : null;

      // Firestore: todas las lecturas (tx.get) antes de cualquier escritura
      let rutaSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let uSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let walletBalanceAfter: number | undefined;

      if (rutaRef) {
        rutaSnap = await tx.get(rutaRef);
        if (!rutaSnap.exists) {
          throw new Error("RUTA_NOT_FOUND");
        }
        if (!acreditaCajaRuta && usuarioEmpRef) {
          uSnap = await tx.get(usuarioEmpRef);
          if (!uSnap.exists) throw new Error("EMPLEADO_USUARIO_NOT_FOUND");
        }
      }

      const resolucionPago = resolverEstadoTrasMovimiento({
        tipo: "pago",
        nuevoSaldo,
      });

      const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc();
      const pagoData: Record<string, unknown> = {
        monto: montoAplicar,
        fecha: nowTx,
        empleadoId: apiUser.uid,
        tipo: "pago",
        metodoPago: metodo,
        evidencia: evidenciaTrim || null,
        registradoPorUid: uidRegistro,
        registradoPorNombre: nombreRegistro,
        cuotaCapital: parteCapital,
        cuotaGanancia: parteGanancia,
        saldoPendienteAntes: saldoPendiente,
        saldoPendienteDespues: nuevoSaldo,
        adelantoCuotaAntes: adelantoActual,
        adelantoCuotaDespues: adelantoParaGuardar,
        estadoPrestamoAntes,
        estadoPrestamoDespues: resolucionPago.estado,
        acreditaCajaRuta,
        tieneSnapshotsCompletos: true,
        // Snapshots para reversión O(1) sin queries externas
        ultimoPagoIdAnterior: typeof d.ultimoPagoId === "string" ? d.ultimoPagoId : null,
        ultimoPagoFechaAnterior: d.ultimoPagoFecha ?? null,
        intentosFallidosAntes: typeof d.intentosFallidos === "number" ? d.intentosFallidos : 0,
        ...buildCamposAuditoria({
          adminId: adminIdPrestamo,
          empresaId: apiUser.empresaId,
          prestamoId,
          rutaId: rutaIdPrestamo,
          clienteId: clienteIdPrestamo,
          clienteNombre: clienteNombrePrestamo,
          rutaNombre: rutaNombreDesdeSnap(rutaSnap),
          cobradoPorRol: apiUser.role,
        }),
      };
      if (keyTrimmed) pagoData.idempotencyKey = keyTrimmed;

      tx.set(pagoRef, pagoData);

      tx.update(prestamoRef, {
        saldoPendiente: nuevoSaldo,
        estado: resolucionPago.estado,
        updatedAt: nowTx,
        adelantoCuota: adelantoParaGuardar,
        ultimoPagoFecha: FieldValue.serverTimestamp(),
        ultimoPagoId: pagoRef.id,
        intentosFallidos: 0,
        ...(resolucionPago.cierraPrestamo
          ? { fechaCierre: nowTx, cerradoPor: resolucionPago.cerradoPor }
          : {}),
      });

      if (rutaRef && rutaSnap?.exists) {
        if (acreditaCajaRuta) {
          const rutaData = rutaSnap.data() as Record<string, unknown>;
          const cajaRuta = typeof rutaData.cajaRuta === "number" ? rutaData.cajaRuta : 0;
          const cajasEmpleados =
            typeof rutaData.cajasEmpleados === "number" ? rutaData.cajasEmpleados : 0;
          let inversiones = typeof rutaData.inversiones === "number" ? rutaData.inversiones : 0;
          let ganancias = typeof rutaData.ganancias === "number" ? rutaData.ganancias : 0;

          const capitalDescontar = Math.min(parteCapital, inversiones);
          inversiones = Math.round((inversiones - capitalDescontar) * 100) / 100;
          ganancias = snapPesoCOP(Math.round((ganancias + parteGanancia) * 100) / 100);
          const nuevaCajaRuta = Math.round((cajaRuta + montoAplicar) * 100) / 100;
          const nuevoCapital = Math.round((nuevaCajaRuta + cajasEmpleados + inversiones) * 100) / 100;

          tx.update(rutaRef, {
            cajaRuta: nuevaCajaRuta,
            inversiones,
            ganancias,
            capitalTotal: nuevoCapital,
            cobradoAcumulado: FieldValue.increment(montoAplicar),
            ultimaActualizacion: nowTx,
          });
        } else {
          const rutaUpd = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
            rutaSnap.data() as Record<string, unknown>,
            montoAplicar,
            montoPrestamo,
            totalAPagar,
            cobradoAcumuladoAntes
          );
          const { montoAcreditarCajaEmpleado, ...rutaCampos } = rutaUpd;
          tx.update(rutaRef, {
            ...rutaCampos,
            cobradoAcumulado: FieldValue.increment(montoAplicar),
            ultimaActualizacion: nowTx,
          });

          if (uSnap?.exists && usuarioEmpRef) {
            const ud = uSnap.data() as Record<string, unknown>;
            const cEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;
            walletBalanceAfter = Math.round((cEmp + montoAcreditarCajaEmpleado) * 100) / 100;
            tx.update(usuarioEmpRef, {
              cajaEmpleado: walletBalanceAfter,
              ultimaActualizacionCapital: nowTx,
            });
          }
        }
      }

      if (nuevoSaldo <= 0) {
        const clienteId = d.clienteId as string;
        if (clienteId?.trim()) {
          const clienteRef = db
            .collection(EMPRESAS_COLLECTION)
            .doc(apiUser.empresaId)
            .collection(CLIENTES_SUBCOLLECTION)
            .doc(clienteId.trim());
          tx.update(clienteRef, { prestamo_activo: false });
        }
      }

      return {
        pagoId: pagoRef.id,
        saldoPendiente: nuevoSaldo,
        adelantoCuota: adelantoParaGuardar,
        rutaId: rutaIdPrestamo || null,
        empleadoId: cobradorEmpleadoUid,
        acreditaCajaRuta,
        cuotaCapital: parteCapital,
        cuotaGanancia: parteGanancia,
        walletBalanceAfter,
        montoAplicado: montoAplicar,
        estado: resolucionPago.estado as EstadoPrestamo,
      };
    });

    if (result.rutaId) {
      const rutaRef = db
        .collection(EMPRESAS_COLLECTION)
        .doc(apiUser.empresaId)
        .collection(RUTAS_SUBCOLLECTION)
        .doc(result.rutaId);
      const rutaAfter = await rutaRef.get();
      if (rutaAfter.exists) {
        await upsertCapitalRutaSnapshot(
          db,
          apiUser.empresaId,
          result.rutaId,
          rutaAfter.data()!
        );
      }
    }

    try {
      if (result.cuotaCapital > 0) {
        if (result.acreditaCajaRuta) {
          await recordCreditMovement({
            db,
            empresaId: apiUser.empresaId,
            walletType: "ruta_caja",
            walletId: result.rutaId ?? "",
            amount: result.cuotaCapital,
            eventType: "pago_prestamo_admin",
            scope: "ruta",
            createdBy: apiUser.uid,
            relatedEntityType: "pago",
            relatedEntityId: result.pagoId,
            metadata: {
              prestamoId,
              rutaId: result.rutaId,
              metodoPago: metodo,
            },
            operationId: `pago_capital:${result.pagoId}`,
          });
        } else if (result.empleadoId) {
          await recordCreditMovement({
            db,
            empresaId: apiUser.empresaId,
            walletType: "empleado_caja",
            walletId: result.empleadoId,
            amount: result.cuotaCapital,
            eventType: "pago_prestamo_capital",
            scope: "empleado",
            createdBy: apiUser.uid,
            relatedEntityType: "pago",
            relatedEntityId: result.pagoId,
            metadata: {
              prestamoId,
              rutaId: result.rutaId,
              metodoPago: metodo,
            },
            operationId: `pago_capital:${result.pagoId}`,
          });
        }
      }
      if (result.cuotaGanancia > 0) {
        if (result.acreditaCajaRuta) {
          await recordCreditMovement({
            db,
            empresaId: apiUser.empresaId,
            walletType: "ruta_caja",
            walletId: result.rutaId ?? "",
            amount: result.cuotaGanancia,
            eventType: "pago_prestamo_admin",
            scope: "ruta",
            createdBy: apiUser.uid,
            relatedEntityType: "pago",
            relatedEntityId: result.pagoId,
            metadata: {
              prestamoId,
              rutaId: result.rutaId,
              metodoPago: metodo,
            },
            operationId: `pago_interes:${result.pagoId}`,
          });
        } else if (result.empleadoId) {
          await recordCreditMovement({
            db,
            empresaId: apiUser.empresaId,
            walletType: "empleado_caja",
            walletId: result.empleadoId,
            amount: result.cuotaGanancia,
            balanceAfter: result.walletBalanceAfter,
            eventType: "pago_prestamo_interes",
            scope: "empleado",
            createdBy: apiUser.uid,
            relatedEntityType: "pago",
            relatedEntityId: result.pagoId,
            metadata: {
              prestamoId,
              rutaId: result.rutaId,
              metodoPago: metodo,
            },
            operationId: `pago_interes:${result.pagoId}`,
          });
        }
      }
    } catch (e) {
      console.warn("[ledger] No se pudo registrar movimiento de pago", e);
    }

    if (result.saldoPendiente <= 0) {
      const adminUidPrestamo =
        typeof data.adminId === "string" ? data.adminId.trim() : "";
      if (adminUidPrestamo) {
        void db
          .collection(EMPRESAS_COLLECTION)
          .doc(apiUser.empresaId)
          .collection(USUARIOS_SUBCOLLECTION)
          .doc(adminUidPrestamo)
          .set(
            { totalPrestamosActivos: FieldValue.increment(-1) },
            { merge: true }
          );
      }
    }

    scheduleFcmCuotaToAdminIfEmpleado({
      db,
      apiUser,
      prestamoFlat: prestamoPreRead.data()! as Record<string, unknown>,
      prestamoId,
      tipoRegistro: "pago",
      pagoId: result.pagoId,
      monto: result.montoAplicado,
      metodoPago: metodo,
    });

    return finalize(200, {
      ok: true,
      saldoPendiente: result.saldoPendiente,
      adelantoCuota: result.adelantoCuota,
      pagoId: result.pagoId,
      estado: result.estado,
      montoAplicado: result.montoAplicado,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PRESTAMO_NOT_FOUND") {
      return finalize(404, { error: "Préstamo no encontrado" });
    }
    if (msg === "SIN_SALDO_APLICABLE") {
      return finalize(400, { error: "No hay saldo pendiente para aplicar este pago" });
    }
    if (msg === "RUTA_NOT_FOUND") {
      return finalize(400, { error: "Ruta del préstamo no encontrada" });
    }
    if (msg === "EMPLEADO_USUARIO_NOT_FOUND") {
      return finalize(400, { error: "Trabajador no encontrado en la empresa" });
    }
    if (msg.includes("Capital de ruta descuadrado")) {
      return finalize(400, { error: msg });
    }
    return finalize(400, { error: msg || "No se pudo registrar el pago" });
  }
}
