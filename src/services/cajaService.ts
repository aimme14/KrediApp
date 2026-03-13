import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  Timestamp,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import type {
  ClienteRuta,
  CuotaFinancieraExtension,
  DistribucionCuotas,
} from "@/types/finanzas";

type CuotaDoc = CuotaFinancieraExtension & {
  prestamoId: string;
  cuotaTotal: number;
};

function ensureDb(): Firestore {
  if (!db) {
    throw new Error("Firestore no está inicializado");
  }
  return db;
}

// ── Función pura de distribución de pago ─────────────────────────────────────

export interface DistribuirPagoResultado {
  cuotasCerradas: CuotaDoc[];
  cuotaParcial: {
    cuota: CuotaDoc;
    montoAbonado: number;
    saldoPendiente: number;
  } | null;
  excedente: number;
}

/**
 * Distribuye un monto sobre un conjunto de cuotas pendientes/parciales,
 * ordenadas por numeroCuota ASC.
 */
export function distribuirPago(
  monto: number,
  cuotasPendientes: CuotaDoc[]
): DistribuirPagoResultado {
  let restante = monto;
  const cuotasCerradas: CuotaDoc[] = [];
  let cuotaParcial:
    | {
        cuota: CuotaDoc;
        montoAbonado: number;
        saldoPendiente: number;
      }
    | null = null;

  for (const cuota of cuotasPendientes.sort(
    (a, b) => a.numeroCuota - b.numeroCuota
  )) {
    if (restante <= 0) break;
    const saldo = cuota.saldoPendiente;
    if (restante >= saldo) {
      restante -= saldo;
      cuotasCerradas.push(cuota);
    } else {
      cuotaParcial = {
        cuota,
        montoAbonado: restante,
        saldoPendiente: saldo - restante,
      };
      restante = 0;
      break;
    }
  }

  return {
    cuotasCerradas,
    cuotaParcial,
    excedente: restante,
  };
}

// ── Helpers internos Firestore ───────────────────────────────────────────────

async function getCuotasPendientesDePrestamo(
  empresaId: string,
  prestamoId: string
): Promise<CuotaDoc[]> {
  const firestore = ensureDb();
  const cuotasCol = collection(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    PRESTAMOS_SUBCOLLECTION,
    prestamoId,
    "cuotas"
  );
  const q = query(
    cuotasCol,
    where("estado", "in", ["pendiente", "parcial"]),
    orderBy("numeroCuota", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d: QueryDocumentSnapshot): CuotaDoc => {
      const data = d.data() as any;
      return {
        prestamoId,
        cuotaTotal: data.cuotaTotal ?? 0,
        cobradorId: data.cobradorId,
        clienteNombre: data.clienteNombre,
        clienteDireccion: data.clienteDireccion,
        frecuencia: data.frecuencia,
        estado: data.estado,
        montoAbonado: data.montoAbonado ?? 0,
        saldoPendiente: data.saldoPendiente ?? data.cuotaTotal ?? 0,
        numeroCuota: data.numeroCuota,
        totalCuotas: data.totalCuotas,
        fechaVencimiento: data.fechaVencimiento,
        fechaPago: data.fechaPago,
      };
    }
  );
}

// ── Registrar cobro de cuotas ────────────────────────────────────────────────

/**
 * Registra un cobro aplicando la función distribuirPago
 * y actualizando cuotas, intento de cobro, préstamo y jornada/ruta.
 *
 * Nota: este servicio solo cubre la parte de cuotas + intento; la
 * actualización de jornada y ruta debe hacerse en coordinación con
 * jornadaService para compartir la misma transacción cuando se integre.
 */
export async function registrarCobro(
  empresaId: string,
  prestamoId: string,
  rutaId: string,
  jornadaId: string,
  cobradorId: string,
  montoPagado: number,
  metodoPago: "efectivo" | "transferencia"
): Promise<DistribucionCuotas> {
  const firestore = ensureDb();
  if (!empresaId || !prestamoId || !rutaId || !jornadaId || !cobradorId) {
    throw new Error("Faltan parámetros obligatorios para registrar el cobro");
  }
  if (montoPagado <= 0) {
    throw new Error("El monto pagado debe ser mayor que cero");
  }

  const prestamoRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    PRESTAMOS_SUBCOLLECTION,
    prestamoId
  );

  const cuotasPendientes = await getCuotasPendientesDePrestamo(
    empresaId,
    prestamoId
  );
  if (cuotasPendientes.length === 0) {
    throw new Error("El préstamo no tiene cuotas pendientes");
  }

  const distribucion = distribuirPago(montoPagado, cuotasPendientes);

  await runTransaction(firestore, async (tx) => {
    const prestamoSnap = await tx.get(prestamoRef);
    if (!prestamoSnap.exists()) {
      throw new Error("Préstamo no encontrado");
    }
    const prestamoData = prestamoSnap.data() as any;

    // Cerrar cuotas completas
    for (const cuota of distribucion.cuotasCerradas) {
      const cuotaRef = doc(
        firestore,
        EMPRESAS_COLLECTION,
        empresaId,
        PRESTAMOS_SUBCOLLECTION,
        prestamoId,
        "cuotas",
        String(cuota.numeroCuota)
      );
      tx.update(cuotaRef, {
        estado: "pagada",
        montoAbonado: cuota.cuotaTotal,
        saldoPendiente: 0,
        fechaPago: Timestamp.now(),
      });
    }

    // Cuota parcial (si aplica)
    if (distribucion.cuotaParcial) {
      const { cuota, montoAbonado, saldoPendiente } = distribucion.cuotaParcial;
      const cuotaRef = doc(
        firestore,
        EMPRESAS_COLLECTION,
        empresaId,
        PRESTAMOS_SUBCOLLECTION,
        prestamoId,
        "cuotas",
        String(cuota.numeroCuota)
      );
      tx.update(cuotaRef, {
        estado: "parcial",
        montoAbonado: (cuota.montoAbonado ?? 0) + montoAbonado,
        saldoPendiente,
      });
    }

    // Registrar intento de cobro (subcolección intentosCobro del préstamo)
    const intentosCol = collection(
      firestore,
      EMPRESAS_COLLECTION,
      empresaId,
      PRESTAMOS_SUBCOLLECTION,
      prestamoId,
      "intentosCobro"
    );
    const intentoRef = doc(intentosCol);
    tx.set(intentoRef, {
      cobradorId,
      montoPagado,
      metodoPago,
      resultado: "pagado",
      distribucion: {
        cuotasCerradas: distribucion.cuotasCerradas.map(
          (c) => String(c.numeroCuota)
        ),
        cuotaParcial: distribucion.cuotaParcial
          ? {
              cuotaId: String(distribucion.cuotaParcial.cuota.numeroCuota),
              montoAbonado: distribucion.cuotaParcial.montoAbonado,
              saldoPendiente: distribucion.cuotaParcial.saldoPendiente,
            }
          : undefined,
        excedente: distribucion.excedente,
      },
      createdAt: Timestamp.now(),
    });

    // Actualizar estado del préstamo si todas las cuotas quedan pagadas
    const cuotasPendientesRestantes = cuotasPendientes.length -
      distribucion.cuotasCerradas.length -
      (distribucion.cuotaParcial ? 1 : 0);
    const prestamoEstado =
      cuotasPendientesRestantes <= 0 && distribucion.excedente >= 0
        ? "pagado"
        : prestamoData.estado;

    tx.update(prestamoRef, {
      estado: prestamoEstado,
      updatedAt: Timestamp.now(),
    });
  });

  return {
    cuotasCerradas: distribucion.cuotasCerradas.map((c) =>
      String(c.numeroCuota)
    ),
    cuotaParcial: distribucion.cuotaParcial
      ? {
          cuotaId: String(distribucion.cuotaParcial.cuota.numeroCuota),
          montoAbonado: distribucion.cuotaParcial.montoAbonado,
          saldoPendiente: distribucion.cuotaParcial.saldoPendiente,
        }
      : undefined,
    excedente: distribucion.excedente,
  };
}

// ── Registrar no pago ────────────────────────────────────────────────────────

export async function registrarNoPago(
  empresaId: string,
  prestamoId: string,
  cuotaId: string,
  jornadaId: string,
  cobradorId: string,
  motivo: "sin_fondos" | "no_estaba" | "promesa_pago" | "otro",
  nota?: string
): Promise<void> {
  const firestore = ensureDb();
  if (!empresaId || !prestamoId || !cuotaId || !jornadaId || !cobradorId) {
    throw new Error("Faltan parámetros obligatorios para registrar no pago");
  }

  const cuotaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    PRESTAMOS_SUBCOLLECTION,
    prestamoId,
    "cuotas",
    cuotaId
  );

  const prestamoRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    PRESTAMOS_SUBCOLLECTION,
    prestamoId
  );

  await runTransaction(firestore, async (tx) => {
    const cuotaSnap = await tx.get(cuotaRef);
    if (!cuotaSnap.exists()) {
      throw new Error("Cuota no encontrada");
    }

    tx.update(cuotaRef, {
      estado: "mora",
      ultimoIntentoFecha: Timestamp.now(),
      ultimoMotivo: motivo,
    });

    const intentosCol = collection(
      firestore,
      EMPRESAS_COLLECTION,
      empresaId,
      PRESTAMOS_SUBCOLLECTION,
      prestamoId,
      "intentosCobro"
    );
    const intentoRef = doc(intentosCol);
    tx.set(intentoRef, {
      cobradorId,
      resultado: "no_pagado",
      motivoNoPago: motivo,
      nota: nota ?? "",
      createdAt: Timestamp.now(),
    });
  });
}

