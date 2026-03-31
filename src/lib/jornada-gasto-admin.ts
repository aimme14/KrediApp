/**
 * Registrar gasto operativo del empleado con jornada activa (Admin SDK).
 * Misma lógica que services/jornadaService.registrarGasto.
 */

import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  EMPRESAS_COLLECTION,
  JORNADAS_SUBCOLLECTION,
  MOVIMIENTOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

function assertCapitalRuta(
  cajaRuta: number,
  cajasEmpleados: number,
  inversiones: number,
  capitalTotal: number
) {
  if (cajaRuta < 0) throw new Error("Saldo insuficiente en cajaRuta");
  if (cajasEmpleados < 0) throw new Error("Saldo insuficiente en cajaEmpleado");
  if (inversiones < 0) throw new Error("Saldo de inversiones negativo");
  const suma = cajaRuta + cajasEmpleados + inversiones;
  if (suma !== capitalTotal) {
    throw new Error("Capital descuadrado — revisar operación");
  }
}

export async function getJornadaActivaEmpleado(
  db: Firestore,
  empresaId: string,
  empleadoId: string
): Promise<{ jornadaId: string; rutaId: string } | null> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(JORNADAS_SUBCOLLECTION)
    .where("empleadoId", "==", empleadoId)
    .where("estado", "==", "activa")
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() as { rutaId?: string };
  const rutaId = typeof data.rutaId === "string" ? data.rutaId : "";
  if (!rutaId) return null;
  return { jornadaId: doc.id, rutaId };
}

export async function registrarGastoJornadaDesdeApi(
  db: Firestore,
  empresaId: string,
  jornadaId: string,
  rutaId: string,
  monto: number,
  descripcion: string,
  categoria: "transporte" | "alimentacion" | "otro"
): Promise<void> {
  if (!empresaId || !jornadaId || !rutaId) {
    throw new Error("empresaId, jornadaId y rutaId son obligatorios");
  }
  if (monto <= 0) {
    throw new Error("El monto del gasto debe ser mayor que cero");
  }

  const jornadaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(JORNADAS_SUBCOLLECTION)
    .doc(jornadaId);

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const movimientoRef = jornadaRef
    .collection(MOVIMIENTOS_SUBCOLLECTION)
    .doc();

  await db.runTransaction(async (tx) => {
    const jornadaSnap = await tx.get(jornadaRef);
    if (!jornadaSnap.exists) {
      throw new Error("Jornada no encontrada");
    }
    const jornada = jornadaSnap.data() as Record<string, unknown>;
    if (jornada.estado !== "activa") {
      throw new Error("La jornada no está activa");
    }
    if (jornada.rutaId !== rutaId) {
      throw new Error("La ruta no coincide con la jornada");
    }

    let cajaActual = (jornada.cajaActual as number) ?? 0;
    let gastosDelDia = (jornada.gastosDelDia as number) ?? 0;

    if (cajaActual < monto) {
      throw new Error("Saldo insuficiente en caja del empleado");
    }

    cajaActual -= monto;
    gastosDelDia += monto;

    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
    const ruta = rutaSnap.data() as Record<string, unknown>;

    const cajaRuta = (ruta.cajaRuta as number) ?? 0;
    const cajasEmpleados = (ruta.cajasEmpleados as number) ?? 0;
    const inversiones = (ruta.inversiones as number) ?? 0;
    let capitalTotal =
      (ruta.capitalTotal as number) ?? cajaRuta + cajasEmpleados + inversiones;

    capitalTotal -= monto;

    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, capitalTotal);

    const now = Timestamp.now();

    tx.update(jornadaRef, {
      cajaActual,
      gastosDelDia,
    });

    tx.set(movimientoRef, {
      tipo: "gasto",
      monto,
      descripcion,
      categoriaGasto: categoria,
      fecha: now,
    });

    tx.update(rutaRef, {
      gastos: ((ruta.gastos as number) ?? 0) + monto,
      capitalTotal,
      ultimaActualizacion: now,
    });
  });

  const rutaAfter = await rutaRef.get();
  if (rutaAfter.exists) {
    await upsertCapitalRutaSnapshot(db, empresaId, rutaId, rutaAfter.data()!);
  }
}
