import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  JORNADAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  computeRutaCamposTrasCobroPrestamoCobroEnEmpleado,
  computeRutaCamposTrasPerdidaPrestamo,
  splitMontoPagoEnCapitalYGanancia,
} from "@/lib/ruta-financiera-admin";
import { getJornadaActivaEmpleado } from "@/lib/jornada-gasto-admin";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { recordCreditMovement } from "@/lib/financial-ledger";
import {
  startIdempotentOperation,
  finishIdempotentOperation,
} from "@/lib/financial-idempotency";

const MOTIVOS_NO_PAGO = ["sin_fondos", "no_estaba", "promesa_pago", "otro"] as const;
const MOTIVOS_PERDIDA = [
  "imposible_cobrar",
  "cliente_perdido",
  "acuerdo_quita",
  "otro",
] as const;
const MAX_PAGOS_LIST = 50;
/** Tras este número de «no pago» consecutivos el préstamo pasa a estado mora. */
const NO_PAGOS_CONSECUTIVOS_PARA_MORA = 3;

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
      motivoPerdida: typeof d.motivoPerdida === "string" ? d.motivoPerdida : null,
      registradoPorUid: d.registradoPorUid ?? d.empleadoId ?? null,
      registradoPorNombre: d.registradoPorNombre ?? null,
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

  if (tipo === "no_pago") {
    const motivo =
      motivoNoPago && MOTIVOS_NO_PAGO.includes(motivoNoPago as (typeof MOTIVOS_NO_PAGO)[number])
        ? (motivoNoPago as (typeof MOTIVOS_NO_PAGO)[number])
        : "otro";

    const empUidNoPago =
      typeof data.empleadoId === "string" && data.empleadoId.trim()
        ? data.empleadoId.trim()
        : apiUser.uid;
    const rutaIdPrestamoNoPago =
      typeof data.rutaId === "string" ? data.rutaId.trim() : "";
    const preJornadaNoPago =
      rutaIdPrestamoNoPago && empUidNoPago
        ? await getJornadaActivaEmpleado(db, apiUser.empresaId, empUidNoPago)
        : null;

    try {
      await db.runTransaction(async (tx) => {
        const prSnap = await tx.get(prestamoRef);
        if (!prSnap.exists) {
          throw new Error("PRESTAMO_NOT_FOUND");
        }
        const pr = prSnap.data()!;
        const rutaIdPr =
          typeof pr.rutaId === "string" ? pr.rutaId.trim() : "";

        const jRef =
          preJornadaNoPago &&
          preJornadaNoPago.rutaId === rutaIdPr &&
          rutaIdPr
            ? db
                .collection(EMPRESAS_COLLECTION)
                .doc(apiUser.empresaId)
                .collection(JORNADAS_SUBCOLLECTION)
                .doc(preJornadaNoPago.jornadaId)
            : null;

        let jSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        if (jRef) {
          jSnap = await tx.get(jRef);
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
        });

        const prevFallos =
          typeof pr.intentosFallidos === "number" ? pr.intentosFallidos : 0;
        const intentosFallidos = prevFallos + 1;
        const yaEnMora = pr.estado === "mora";
        const pasarAMora =
          yaEnMora || intentosFallidos >= NO_PAGOS_CONSECUTIVOS_PARA_MORA;

        tx.update(prestamoRef, {
          intentosFallidos,
          estado: pasarAMora ? "mora" : "activo",
          updatedAt: now,
        });

        const jd = jSnap?.data() as Record<string, unknown> | undefined;
        if (
          jRef &&
          jSnap?.exists &&
          jd &&
          jd.estado === "activa" &&
          (jd.rutaId as string) === rutaIdPr
        ) {
          const noPag =
            typeof jd.clientesNoPagaron === "number" ? jd.clientesNoPagaron : 0;
          const visit =
            typeof jd.clientesVisitados === "number" ? jd.clientesVisitados : 0;
          tx.update(jRef, {
            clientesNoPagaron: noPag + 1,
            clientesVisitados: visit + 1,
          });
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "PRESTAMO_NOT_FOUND") {
        return finalize(404, { error: "Préstamo no encontrado" });
      }
      return finalize(400, { error: msg || "No se pudo registrar el no pago" });
    }

    return finalize(200, { ok: true, tipo: "no_pago" });
  }

  if (tipo === "perdida") {
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

        const saldoPendiente = (d.saldoPendiente as number) ?? 0;
        const montoAplicar = Math.min(rawMonto, saldoPendiente);
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
        const { capital: parteCapital, ganancia: parteGanancia } =
          splitMontoPagoEnCapitalYGanancia(montoAplicar, montoPrestamo, totalAPagar);

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
          parteCapitalPerdida: parteCapital,
          parteGananciaPerdida: parteGanancia,
        });

        tx.update(prestamoRef, {
          saldoPendiente: nuevoSaldo,
          estado: nuevoSaldo <= 0 ? "pagado" : d.estado,
          updatedAt: nowTx,
          adelantoCuota: adelantoParaGuardar,
        });

        if (rutaRef && rutaSnap?.exists) {
          const rutaUpd = computeRutaCamposTrasPerdidaPrestamo(
            rutaSnap.data() as Record<string, unknown>,
            montoAplicar,
            montoPrestamo,
            totalAPagar
          );
          tx.update(rutaRef, {
            ...rutaUpd,
            ultimaActualizacion: nowTx,
          });
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
          saldoPendiente: nuevoSaldo,
          adelantoCuota: adelantoParaGuardar,
          rutaId: rutaIdPrestamo || null,
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

      return finalize(200, {
        ok: true,
        tipo: "perdida",
        saldoPendiente: result.saldoPendiente,
        adelantoCuota: result.adelantoCuota,
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
      if (msg.includes("Capital de ruta descuadrado")) {
        return finalize(400, { error: msg });
      }
      return finalize(400, { error: msg || "No se pudo registrar la pérdida" });
    }
  }

  if (typeof monto !== "number" || monto <= 0) {
    return finalize(400, { error: "Monto debe ser un número positivo" });
  }
  const metodo = metodoPago === "transferencia" ? "transferencia" : "efectivo";

  const prestamoPreRead = await prestamoRef.get();
  if (!prestamoPreRead.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }
  const empleadoTitularCobro =
    prestamoPreRead.exists &&
    typeof prestamoPreRead.data()?.empleadoId === "string" &&
    prestamoPreRead.data()!.empleadoId.trim()
      ? (prestamoPreRead.data()!.empleadoId as string).trim()
      : apiUser.uid;
  const rutaIdPreRead =
    prestamoPreRead.exists && typeof prestamoPreRead.data()?.rutaId === "string"
      ? (prestamoPreRead.data()!.rutaId as string).trim()
      : "";
  const preJornadaCobro =
    rutaIdPreRead && typeof monto === "number" && monto > 0
      ? await getJornadaActivaEmpleado(db, apiUser.empresaId, empleadoTitularCobro)
      : null;
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

      const nowTx = new Date();
      const { capital: parteCapital, ganancia: parteGanancia } =
        splitMontoPagoEnCapitalYGanancia(montoAplicar, montoPrestamo, totalAPagar);

      const pagoRef = prestamoRef.collection(PAGOS_SUBCOLLECTION).doc();
      const pagoData: Record<string, unknown> = {
        monto: montoAplicar,
        fecha: nowTx,
        empleadoId: apiUser.uid,
        tipo: "pago",
        metodoPago: metodo,
        evidencia: (evidencia ?? "").trim() || null,
        registradoPorUid: uidRegistro,
        registradoPorNombre: nombreRegistro,
        cuotaCapital: parteCapital,
        cuotaGanancia: parteGanancia,
      };
      if (keyTrimmed) pagoData.idempotencyKey = keyTrimmed;

      const empUid =
        typeof d.empleadoId === "string" && d.empleadoId.trim()
          ? d.empleadoId.trim()
          : apiUser.uid;
      const usuarioEmpRef = db
        .collection(EMPRESAS_COLLECTION)
        .doc(apiUser.empresaId)
        .collection(USUARIOS_SUBCOLLECTION)
        .doc(empUid);

      const jRef =
        preJornadaCobro && preJornadaCobro.rutaId === rutaIdPrestamo
          ? db
              .collection(EMPRESAS_COLLECTION)
              .doc(apiUser.empresaId)
              .collection(JORNADAS_SUBCOLLECTION)
              .doc(preJornadaCobro.jornadaId)
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
      let jSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let uSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        let walletBalanceAfter: number | undefined;

      if (rutaRef) {
        rutaSnap = await tx.get(rutaRef);
        if (!rutaSnap.exists) {
          throw new Error("RUTA_NOT_FOUND");
        }
        if (jRef) {
          jSnap = await tx.get(jRef);
          const jd = jSnap.data() as Record<string, unknown> | undefined;
          const jornadaActivaEnRuta =
            jSnap.exists &&
            jd &&
            jd.estado === "activa" &&
            (jd.rutaId as string) === rutaIdPrestamo;
          if (!jornadaActivaEnRuta) {
            uSnap = await tx.get(usuarioEmpRef);
            if (!uSnap.exists) throw new Error("EMPLEADO_USUARIO_NOT_FOUND");
          }
        } else {
          uSnap = await tx.get(usuarioEmpRef);
          if (!uSnap.exists) throw new Error("EMPLEADO_USUARIO_NOT_FOUND");
        }
      }

      tx.set(pagoRef, pagoData);

      tx.update(prestamoRef, {
        saldoPendiente: nuevoSaldo,
        estado: nuevoSaldo <= 0 ? "pagado" : "activo",
        updatedAt: nowTx,
        adelantoCuota: adelantoParaGuardar,
        ultimoPagoFecha: FieldValue.serverTimestamp(),
        intentosFallidos: 0,
      });

      if (rutaRef && rutaSnap?.exists) {
        const rutaUpd = computeRutaCamposTrasCobroPrestamoCobroEnEmpleado(
          rutaSnap.data() as Record<string, unknown>,
          montoAplicar,
          montoPrestamo,
          totalAPagar
        );
        const { montoAcreditarCajaEmpleado, ...rutaCampos } = rutaUpd;
        tx.update(rutaRef, {
          ...rutaCampos,
          ultimaActualizacion: nowTx,
        });

        if (jRef && jSnap) {
          const jd = jSnap.data() as Record<string, unknown> | undefined;
          if (
            jSnap.exists &&
            jd &&
            jd.estado === "activa" &&
            (jd.rutaId as string) === rutaIdPrestamo
          ) {
            const cajaA = typeof jd.cajaActual === "number" ? jd.cajaActual : 0;
            const cobrosDelDia = typeof jd.cobrosDelDia === "number" ? jd.cobrosDelDia : 0;
            const clientesCobrados = typeof jd.clientesCobrados === "number" ? jd.clientesCobrados : 0;
            const m = Math.round(montoAcreditarCajaEmpleado * 100) / 100;
            walletBalanceAfter = Math.round((cajaA + m) * 100) / 100;
            tx.update(jRef, {
              cajaActual: walletBalanceAfter,
              cobrosDelDia: Math.round((cobrosDelDia + m) * 100) / 100,
              clientesCobrados: clientesCobrados + 1,
            });
          } else if (uSnap?.exists) {
            const ud = uSnap.data() as Record<string, unknown>;
            const cEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;
            walletBalanceAfter = Math.round((cEmp + montoAcreditarCajaEmpleado) * 100) / 100;
            tx.update(usuarioEmpRef, {
              cajaEmpleado: walletBalanceAfter,
              ultimaActualizacionCapital: nowTx,
            });
          }
        } else if (uSnap?.exists) {
          const ud = uSnap.data() as Record<string, unknown>;
          const cEmp = typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0;
          walletBalanceAfter = Math.round((cEmp + montoAcreditarCajaEmpleado) * 100) / 100;
          tx.update(usuarioEmpRef, {
            cajaEmpleado: walletBalanceAfter,
            ultimaActualizacionCapital: nowTx,
          });
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
          empleadoId: empUid,
          cuotaCapital: parteCapital,
          cuotaGanancia: parteGanancia,
          walletBalanceAfter,
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
      if (result.cuotaGanancia > 0) {
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
    } catch (e) {
      console.warn("[ledger] No se pudo registrar movimiento de pago", e);
    }

    return finalize(200, {
      ok: true,
      saldoPendiente: result.saldoPendiente,
      adelantoCuota: result.adelantoCuota,
      pagoId: result.pagoId,
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
