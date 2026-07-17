import type { Firestore } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
} from "@/lib/empresas-db";

export type MotivoAprobacionPrestamo =
  | "cliente_sin_historial"
  | "monto_supera_ultimo_prestamo"
  | "auto_aprobado";

export type ResultadoEvaluacionAprobacion = {
  requiereAprobacionAdmin: boolean;
  motivo: MotivoAprobacionPrestamo;
  /** Monto del último préstamo histórico (referencia). */
  montoUltimoPrestamo: number | null;
  cantidadPrestamosHistoricos: number;
};

type PrestamoHistoricoRow = {
  monto: number;
  creadoEn: Date | null;
  fechaInicio: Date | null;
};

function timestampToDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const d = (value as { toDate?: () => Date }).toDate?.();
    return d instanceof Date ? d : null;
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function ordenarPorMasReciente(a: PrestamoHistoricoRow, b: PrestamoHistoricoRow): number {
  const ta = a.creadoEn?.getTime() ?? a.fechaInicio?.getTime() ?? 0;
  const tb = b.creadoEn?.getTime() ?? b.fechaInicio?.getTime() ?? 0;
  return tb - ta;
}

/** Préstamos cerrados (pagado) del cliente, ordenados del más reciente al más antiguo. */
export async function listPrestamosHistoricosCliente(
  db: Firestore,
  empresaId: string,
  clienteId: string
): Promise<PrestamoHistoricoRow[]> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .where("clienteId", "==", clienteId.trim())
    .limit(100)
    .get();

  return snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((d) => d.estado === "pagado")
    .map((d) => ({
      monto: typeof d.monto === "number" ? d.monto : 0,
      creadoEn: timestampToDate(d.creadoEn),
      fechaInicio: timestampToDate(d.fechaInicio),
    }))
    .sort(ordenarPorMasReciente);
}

export type PrestamoHistorialUiRow = {
  id: string;
  monto: number;
  interes: number;
  modalidad: string;
  numeroCuotas: number;
  totalAPagar: number;
  saldoPendiente: number;
  estado: string;
  totalCastigado: number;
  fechaInicio: string | null;
  fechaCierre: string | null;
  creadoEn: string | null;
};

/**
 * Últimos préstamos del cliente para mostrar en UI (máx. `max` lecturas).
 * Ordena por creadoEn desc; requiere índice compuesto clienteId + creadoEn.
 */
export async function listUltimosPrestamosClienteUi(
  db: Firestore,
  empresaId: string,
  clienteId: string,
  max = 3
): Promise<PrestamoHistorialUiRow[]> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .where("clienteId", "==", clienteId.trim())
    .orderBy("creadoEn", "desc")
    .limit(max)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      monto: typeof d.monto === "number" ? d.monto : 0,
      interes: typeof d.interes === "number" ? d.interes : 0,
      modalidad: typeof d.modalidad === "string" ? d.modalidad : "mensual",
      numeroCuotas: typeof d.numeroCuotas === "number" ? d.numeroCuotas : 0,
      totalAPagar: typeof d.totalAPagar === "number" ? d.totalAPagar : 0,
      saldoPendiente: typeof d.saldoPendiente === "number" ? d.saldoPendiente : 0,
      estado: typeof d.estado === "string" ? d.estado : "activo",
      totalCastigado: typeof d.totalCastigado === "number" ? d.totalCastigado : 0,
      fechaInicio: timestampToDate(d.fechaInicio)?.toISOString() ?? null,
      fechaCierre: timestampToDate(d.fechaCierre)?.toISOString() ?? null,
      creadoEn: timestampToDate(d.creadoEn)?.toISOString() ?? null,
    };
  });
}

/** Monto del último préstamo histórico del cliente (referencia para auto-aprobación). */
export async function getMontoUltimoPrestamoCliente(
  db: Firestore,
  empresaId: string,
  clienteId: string
): Promise<number | null> {
  const historicos = await listPrestamosHistoricosCliente(db, empresaId, clienteId);
  if (historicos.length === 0) return null;
  return historicos[0].monto;
}

export function evaluarAprobacionConReferencia(
  montoSolicitado: number,
  montoUltimoPrestamo: number | null,
  cantidadPrestamosHistoricos: number
): ResultadoEvaluacionAprobacion {
  if (cantidadPrestamosHistoricos === 0 || montoUltimoPrestamo === null) {
    return {
      requiereAprobacionAdmin: true,
      motivo: "cliente_sin_historial",
      montoUltimoPrestamo: null,
      cantidadPrestamosHistoricos: 0,
    };
  }

  if (montoSolicitado <= montoUltimoPrestamo) {
    return {
      requiereAprobacionAdmin: false,
      motivo: "auto_aprobado",
      montoUltimoPrestamo,
      cantidadPrestamosHistoricos,
    };
  }

  return {
    requiereAprobacionAdmin: true,
    motivo: "monto_supera_ultimo_prestamo",
    montoUltimoPrestamo,
    cantidadPrestamosHistoricos,
  };
}

export async function evaluarAprobacionPrestamoEmpleado(
  db: Firestore,
  empresaId: string,
  clienteId: string,
  montoSolicitado: number
): Promise<ResultadoEvaluacionAprobacion> {
  const historicos = await listPrestamosHistoricosCliente(db, empresaId, clienteId);
  const montoUltimoPrestamo = historicos.length > 0 ? historicos[0].monto : null;
  return evaluarAprobacionConReferencia(
    montoSolicitado,
    montoUltimoPrestamo,
    historicos.length
  );
}

export function validarClienteElegibleParaPrestamo(clienteData: Record<string, unknown>): void {
  if (clienteData.moroso === true) {
    throw new Error("No se puede otorgar préstamo a un cliente moroso");
  }
  if (clienteData.prestamo_activo === true) {
    throw new Error("El cliente ya tiene un préstamo activo");
  }
}
