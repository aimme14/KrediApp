import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { syncCapitalRutaSnapshotClient } from "@/services/capitalRutaSnapshotClient";
import type { Jornada, Movimiento, TipoMovimiento } from "@/types/finanzas";

function ensureDb(): Firestore {
  if (!db) {
    throw new Error("Firestore no está inicializado");
  }
  return db;
}

const JORNADAS_SUBCOLLECTION = "jornadas";
const MOVIMIENTOS_SUBCOLLECTION = "movimientos";

function mapJornadaDoc(
  snap: QueryDocumentSnapshot | null
): Jornada | null {
  if (!snap) return null;
  const data = snap.data() as any;
  return {
    id: snap.id,
    rutaId: data.rutaId,
    empleadoId: data.empleadoId,
    empleadoNombre: data.empleadoNombre,
    fecha: data.fecha,
    estado: data.estado,
    entregaInicial: data.entregaInicial ?? 0,
    cobrosDelDia: data.cobrosDelDia ?? 0,
    gastosDelDia: data.gastosDelDia ?? 0,
    cajaActual: data.cajaActual ?? 0,
    devueltoAlCierre: data.devueltoAlCierre ?? 0,
    clientesVisitados: data.clientesVisitados ?? 0,
    clientesCobrados: data.clientesCobrados ?? 0,
    clientesNoPagaron: data.clientesNoPagaron ?? 0,
  };
}

function assertCapitalRuta(
  cajaRuta: number,
  cajasEmpleados: number,
  inversiones: number,
  perdidas: number,
  capitalTotal: number
) {
  if (cajaRuta < 0) throw new Error("Saldo insuficiente en la base de la ruta");
  if (cajasEmpleados < 0) throw new Error("Saldo insuficiente en base del empleado");
  if (inversiones < 0) throw new Error("Saldo de inversiones negativo");
  const esperado = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta,
    cajasEmpleados,
    inversiones,
    perdidas,
  });
  if (Math.abs(esperado - capitalTotal) > 0.02) {
    throw new Error("Capital descuadrado — revisar operación");
  }
}

// ── Iniciar jornada ──────────────────────────────────────────────────────────

export async function iniciarJornada(
  empresaId: string,
  rutaId: string,
  empleadoId: string,
  empleadoNombre: string,
  montoEntrega: number
): Promise<string> {
  const firestore = ensureDb();
  if (!empresaId || !rutaId || !empleadoId) {
    throw new Error("empresaId, rutaId y empleadoId son obligatorios");
  }
  if (montoEntrega <= 0) {
    throw new Error("El monto de entrega inicial debe ser mayor que cero");
  }

  const rutaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );
  const jornadasCol = collection(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION
  );
  const jornadaRef = doc(jornadasCol);

  const movimientosCol = collection(
    jornadaRef,
    MOVIMIENTOS_SUBCOLLECTION
  );
  const movimientoRef = doc(movimientosCol);

  await runTransaction(firestore, async (tx) => {
    // Validar que no exista jornada activa para el empleado
    const jornadasActivasQ = query(
      jornadasCol,
      where("empleadoId", "==", empleadoId),
      where("estado", "==", "activa"),
      limit(1)
    );
    const activasSnap = await getDocs(jornadasActivasQ);
    if (!activasSnap.empty) {
      throw new Error("Ya existe una jornada activa para este empleado");
    }

    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists()) throw new Error("Ruta no encontrada");
    const ruta = rutaSnap.data() as any;

    let cajaRuta = ruta.cajaRuta ?? 0;
    let cajasEmpleados = ruta.cajasEmpleados ?? 0;
    const inversiones = ruta.inversiones ?? 0;
    const perdidas = ruta.perdidas ?? 0;
    const capitalTotal =
      ruta.capitalTotal ??
      computeCapitalTotalRutaDesdeSaldos({
        cajaRuta,
        cajasEmpleados,
        inversiones,
        perdidas,
      });

    if (cajaRuta < montoEntrega) {
      throw new Error("Saldo insuficiente en la base de la ruta");
    }

    cajaRuta -= montoEntrega;
    cajasEmpleados += montoEntrega;
    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, perdidas, capitalTotal);

    const now = Timestamp.now();

    tx.set(jornadaRef, {
      rutaId,
      empleadoId,
      empleadoNombre,
      fecha: now,
      estado: "activa",
      entregaInicial: montoEntrega,
      cobrosDelDia: 0,
      gastosDelDia: 0,
      cajaActual: montoEntrega,
      devueltoAlCierre: 0,
      clientesVisitados: 0,
      clientesCobrados: 0,
      clientesNoPagaron: 0,
    });

    tx.set(movimientoRef, {
      tipo: "entrega_inicial" as TipoMovimiento,
      monto: montoEntrega,
      descripcion: "Entrega inicial de base al empleado",
      fecha: now,
    });

    tx.update(rutaRef, {
      cajaRuta,
      cajasEmpleados,
      capitalTotal,
      ultimaActualizacion: now,
    });
  });

  await syncCapitalRutaSnapshotClient(empresaId, rutaId);

  return jornadaRef.id;
}

// ── Registrar gasto en jornada ──────────────────────────────────────────────

export async function registrarGasto(
  empresaId: string,
  jornadaId: string,
  rutaId: string,
  monto: number,
  descripcion: string,
  categoria: "transporte" | "alimentacion" | "otro"
): Promise<void> {
  const firestore = ensureDb();
  if (!empresaId || !jornadaId || !rutaId) {
    throw new Error("empresaId, jornadaId y rutaId son obligatorios");
  }
  if (monto <= 0) {
    throw new Error("El monto del gasto debe ser mayor que cero");
  }

  const jornadaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION,
    jornadaId
  );
  const rutaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );
  const movimientosCol = collection(
    jornadaRef,
    MOVIMIENTOS_SUBCOLLECTION
  );
  const movimientoRef = doc(movimientosCol);

  await runTransaction(firestore, async (tx) => {
    const jornadaSnap = await tx.get(jornadaRef);
    if (!jornadaSnap.exists()) {
      throw new Error("Jornada no encontrada");
    }
    const jornada = jornadaSnap.data() as any;
    let cajaActual = jornada.cajaActual ?? 0;
    let gastosDelDia = jornada.gastosDelDia ?? 0;

    if (cajaActual < monto) {
      throw new Error("Saldo insuficiente en base del empleado");
    }

    cajaActual -= monto;
    gastosDelDia += monto;

    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists()) throw new Error("Ruta no encontrada");
    const ruta = rutaSnap.data() as any;

    const cajaRuta = ruta.cajaRuta ?? 0;
    let cajasEmpleados = ruta.cajasEmpleados ?? 0;
    const inversiones = ruta.inversiones ?? 0;
    const perdidas = ruta.perdidas ?? 0;

    cajasEmpleados -= monto;
    const capitalTotal = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });

    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, perdidas, capitalTotal);

    const now = Timestamp.now();

    tx.update(jornadaRef, {
      cajaActual,
      gastosDelDia,
    });

    tx.set(movimientoRef, {
      tipo: "gasto" as TipoMovimiento,
      monto,
      descripcion,
      categoriaGasto: categoria,
      fecha: now,
    });

    tx.update(rutaRef, {
      cajasEmpleados,
      gastos: (ruta.gastos ?? 0) + monto,
      capitalTotal,
      ultimaActualizacion: now,
    });
  });

  await syncCapitalRutaSnapshotClient(empresaId, rutaId);
}

// ── Registrar cobro en jornada ──────────────────────────────────────────────

export async function registrarCobroEnJornada(
  empresaId: string,
  jornadaId: string,
  rutaId: string,
  cuotaTotal: number,
  cuotaCapital: number,
  cuotaGanancia: number,
  prestamoId: string,
  cuotaId: string,
  clienteId: string,
  clienteNombre: string
): Promise<void> {
  const firestore = ensureDb();
  if (!empresaId || !jornadaId || !rutaId) {
    throw new Error("empresaId, jornadaId y rutaId son obligatorios");
  }
  if (cuotaTotal <= 0) {
    throw new Error("El monto de la cuota debe ser mayor que cero");
  }

  const jornadaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION,
    jornadaId
  );
  const rutaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );
  const movimientosCol = collection(
    jornadaRef,
    MOVIMIENTOS_SUBCOLLECTION
  );
  const movimientoRef = doc(movimientosCol);

  await runTransaction(firestore, async (tx) => {
    const jornadaSnap = await tx.get(jornadaRef);
    if (!jornadaSnap.exists()) throw new Error("Jornada no encontrada");
    const jornada = jornadaSnap.data() as any;

    let cajaActual = jornada.cajaActual ?? 0;
    let cobrosDelDia = jornada.cobrosDelDia ?? 0;
    let clientesCobrados = jornada.clientesCobrados ?? 0;

    cajaActual += cuotaTotal;
    cobrosDelDia += cuotaTotal;
    clientesCobrados += 1;

    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists()) throw new Error("Ruta no encontrada");
    const ruta = rutaSnap.data() as any;

    const cajaRuta = ruta.cajaRuta ?? 0;
    let cajasEmpleados = ruta.cajasEmpleados ?? 0;
    let inversiones = ruta.inversiones ?? 0;
    let ganancias = ruta.ganancias ?? 0;
    const perdidas = ruta.perdidas ?? 0;

    cajasEmpleados += cuotaTotal;
    inversiones -= cuotaCapital;
    ganancias += cuotaGanancia;
    const capitalTotal = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });

    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, perdidas, capitalTotal);

    const now = Timestamp.now();

    tx.update(jornadaRef, {
      cajaActual,
      cobrosDelDia,
      clientesCobrados,
    });

    tx.set(movimientoRef, {
      tipo: "cobro_cuota" as TipoMovimiento,
      monto: cuotaTotal,
      descripcion: `Cobro de cuota ${cuotaId} del préstamo ${prestamoId}`,
      fecha: now,
      prestamoId,
      cuotaId,
      clienteId,
      clienteNombre,
      cuotaCapital,
      cuotaGanancia,
    });

    tx.update(rutaRef, {
      cajasEmpleados,
      inversiones,
      ganancias,
      capitalTotal,
      ultimaActualizacion: now,
    });
  });

  await syncCapitalRutaSnapshotClient(empresaId, rutaId);
}

// ── Otros helpers de jornada ────────────────────────────────────────────────

export async function registrarNoPagoEnJornada(
  empresaId: string,
  jornadaId: string
): Promise<void> {
  const firestore = ensureDb();
  const jornadaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION,
    jornadaId
  );

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(jornadaRef);
    if (!snap.exists()) throw new Error("Jornada no encontrada");
    const jornada = snap.data() as any;
    tx.update(jornadaRef, {
      clientesNoPagaron: (jornada.clientesNoPagaron ?? 0) + 1,
      clientesVisitados: (jornada.clientesVisitados ?? 0) + 1,
    });
  });
}

export async function marcarClienteVisitado(
  empresaId: string,
  jornadaId: string
): Promise<void> {
  const firestore = ensureDb();
  const jornadaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION,
    jornadaId
  );

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(jornadaRef);
    if (!snap.exists()) throw new Error("Jornada no encontrada");
    const jornada = snap.data() as any;
    tx.update(jornadaRef, {
      clientesVisitados: (jornada.clientesVisitados ?? 0) + 1,
    });
  });
}

export async function cerrarJornada(
  empresaId: string,
  jornadaId: string,
  rutaId: string
): Promise<void> {
  const firestore = ensureDb();
  if (!empresaId || !jornadaId || !rutaId) {
    throw new Error("empresaId, jornadaId y rutaId son obligatorios");
  }

  const jornadaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION,
    jornadaId
  );
  const rutaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );
  const movimientosCol = collection(
    jornadaRef,
    MOVIMIENTOS_SUBCOLLECTION
  );
  const movimientoRef = doc(movimientosCol);

  await runTransaction(firestore, async (tx) => {
    const jornadaSnap = await tx.get(jornadaRef);
    if (!jornadaSnap.exists()) throw new Error("Jornada no encontrada");
    const jornada = jornadaSnap.data() as any;

    if (jornada.estado !== "activa") {
      throw new Error("La jornada ya está cerrada");
    }

    let cajaActual = jornada.cajaActual ?? 0;
    const entregaInicial = jornada.entregaInicial ?? 0;

    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists()) throw new Error("Ruta no encontrada");
    const ruta = rutaSnap.data() as any;

    let cajaRuta = ruta.cajaRuta ?? 0;
    let cajasEmpleados = ruta.cajasEmpleados ?? 0;
    const inversiones = ruta.inversiones ?? 0;
    const perdidas = ruta.perdidas ?? 0;

    cajaRuta += cajaActual;
    cajasEmpleados -= entregaInicial;

    const capitalTotal = computeCapitalTotalRutaDesdeSaldos({
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
    });

    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, perdidas, capitalTotal);

    const now = Timestamp.now();

    tx.set(movimientoRef, {
      tipo: "cierre" as TipoMovimiento,
      monto: cajaActual,
      descripcion: "Cierre de jornada",
      fecha: now,
    });

    tx.update(jornadaRef, {
      devueltoAlCierre: cajaActual,
      cajaActual: 0,
      estado: "cerrada",
    });

    tx.update(rutaRef, {
      cajaRuta,
      cajasEmpleados,
      capitalTotal,
      ultimaActualizacion: now,
    });
  });

  await syncCapitalRutaSnapshotClient(empresaId, rutaId);
}

export async function getJornadaActiva(
  empresaId: string,
  empleadoId: string
): Promise<Jornada | null> {
  const firestore = ensureDb();
  const jornadasCol = collection(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION
  );
  const q = query(
    jornadasCol,
    where("empleadoId", "==", empleadoId),
    where("estado", "==", "activa"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapJornadaDoc(snap.docs[0]);
}

export async function getMovimientosJornada(
  empresaId: string,
  jornadaId: string
): Promise<Movimiento[]> {
  const firestore = ensureDb();
  const jornadaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    JORNADAS_SUBCOLLECTION,
    jornadaId
  );
  const movimientosCol = collection(
    jornadaRef,
    MOVIMIENTOS_SUBCOLLECTION
  );
  const q = query(movimientosCol, orderBy("fecha", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      tipo: data.tipo,
      monto: data.monto,
      descripcion: data.descripcion,
      fecha: data.fecha,
      prestamoId: data.prestamoId,
      cuotaId: data.cuotaId,
      clienteId: data.clienteId,
      clienteNombre: data.clienteNombre,
      cuotaCapital: data.cuotaCapital,
      cuotaGanancia: data.cuotaGanancia,
      categoriaGasto: data.categoriaGasto,
    } as Movimiento;
  });
}

export async function getResumenJornada(
  empresaId: string,
  jornadaId: string
): Promise<{ jornada: Jornada; movimientos: Movimiento[]; efectivoEsperado: number }> {
  const jornada = await (async () => {
    const firestore = ensureDb();
    const jornadaRef = doc(
      firestore,
      EMPRESAS_COLLECTION,
      empresaId,
      JORNADAS_SUBCOLLECTION,
      jornadaId
    );
    const snap = await getDoc(jornadaRef);
    if (!snap.exists()) {
      throw new Error("Jornada no encontrada");
    }
    return mapJornadaDoc(snap as any)!;
  })();

  const movimientos = await getMovimientosJornada(empresaId, jornadaId);
  const efectivoEsperado =
    jornada.entregaInicial + jornada.cobrosDelDia - jornada.gastosDelDia;

  if (efectivoEsperado !== jornada.cajaActual) {
    console.warn("[JORNADA DESCUDRADA]", {
      jornadaId,
      entregaInicial: jornada.entregaInicial,
      cobrosDelDia: jornada.cobrosDelDia,
      gastosDelDia: jornada.gastosDelDia,
      cajaActual: jornada.cajaActual,
      efectivoEsperado,
    });
  }

  return { jornada, movimientos, efectivoEsperado };
}

