/**
 * Operaciones financieras sobre rutas usando Firebase Admin (para API routes).
 * Refleja la lógica de services/rutaService para préstamos.
 */

import type { Firestore } from "firebase-admin/firestore";
import { EMPRESAS_COLLECTION, RUTAS_SUBCOLLECTION } from "@/lib/empresas-db";

/**
 * Impacta la ruta por un nuevo préstamo: cajaRuta -= monto, inversiones += monto.
 * capitalTotal no cambia.
 */
export async function registrarPrestamoEnRuta(
  db: Firestore,
  empresaId: string,
  rutaId: string,
  monto: number
): Promise<void> {
  if (!empresaId || !rutaId) throw new Error("empresaId y rutaId son obligatorios");
  if (monto <= 0) throw new Error("El capital prestado debe ser positivo");

  const rutaRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaId);

  const snap = await rutaRef.get();
  if (!snap.exists) throw new Error("Ruta no encontrada");

  const data = snap.data()!;
  let cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
  const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
  let inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
  const capitalTotal = typeof data.capitalTotal === "number"
    ? data.capitalTotal
    : cajaRuta + cajasEmpleados + inversiones;

  if (cajaRuta < monto) throw new Error("Saldo insuficiente en caja de la ruta");

  cajaRuta -= monto;
  inversiones += monto;

  const suma = cajaRuta + cajasEmpleados + inversiones;
  if (suma !== capitalTotal) {
    throw new Error("Capital descuadrado — revisar operación");
  }

  await rutaRef.update({
    cajaRuta,
    inversiones,
    ultimaActualizacion: new Date(),
  });
}
