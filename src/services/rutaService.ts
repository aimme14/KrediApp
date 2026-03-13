import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  where,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import type { RutaFinanciera } from "@/types/finanzas";

type RutaDocData = Omit<RutaFinanciera, "id">;

function ensureDb(): Firestore {
  if (!db) {
    throw new Error("Firestore no está inicializado");
  }
  return db;
}

function mapRutaSnapshot(snap: DocumentSnapshot | null): RutaFinanciera | null {
  if (!snap || !snap.exists) return null;
  const data = snap.data() as Partial<RutaDocData>;
  const now = Timestamp.now();
  const cajaRuta = data.cajaRuta ?? 0;
  const cajasEmpleados = data.cajasEmpleados ?? 0;
  const inversiones = data.inversiones ?? 0;
  const capitalTotal = data.capitalTotal ?? cajaRuta + cajasEmpleados + inversiones;

  return {
    id: snap.id,
    nombre: data.nombre ?? "",
    zonaId: data.zonaId ?? "",
    empleadosIds: Array.isArray(data.empleadosIds) ? (data.empleadosIds as string[]) : [],
    adminId: data.adminId ?? "",
    cajaRuta,
    cajasEmpleados,
    inversiones,
    capitalTotal,
    ganancias: data.ganancias ?? 0,
    gastos: data.gastos ?? 0,
    perdidas: data.perdidas ?? 0,
    fechaCreacion: (data.fechaCreacion as Timestamp) ?? now,
    ultimaActualizacion: (data.ultimaActualizacion as Timestamp) ?? now,
  };
}

function assertCapitalRuta(
  cajaRuta: number,
  cajasEmpleados: number,
  inversiones: number,
  capitalTotal: number
) {
  if (cajaRuta < 0) throw new Error("Saldo insuficiente en cajaRuta");
  if (cajasEmpleados < 0) throw new Error("Saldo insuficiente en cajasEmpleados");
  if (inversiones < 0) throw new Error("Saldo de inversiones negativo");
  const suma = cajaRuta + cajasEmpleados + inversiones;
  if (suma !== capitalTotal) {
    throw new Error("Capital descuadrado — revisar operación");
  }
}

// ── Servicio de Ruta (nivel empresa/ruta) ────────────────────────────────────

/**
 * Crea una ruta financiera bajo /empresas/{empresaId}/rutas.
 * NOTA: empresaId es obligatorio en esta arquitectura multiempresa.
 */
export async function crearRuta(
  empresaId: string,
  nombre: string,
  zonaId: string,
  adminId: string,
  capitalInicial: number
): Promise<string> {
  const firestore = ensureDb();
  if (!empresaId) throw new Error("empresaId es obligatorio");
  if (!nombre.trim()) throw new Error("El nombre de la ruta es obligatorio");
  if (capitalInicial < 0) throw new Error("El capital inicial no puede ser negativo");

  const rutasCol = collection(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION
  );
  const ref = doc(rutasCol);
  const now = Timestamp.now();

  const cajaRuta = capitalInicial;
  const cajasEmpleados = 0;
  const inversiones = 0;
  const capitalTotal = capitalInicial;

  assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, capitalTotal);

  const data: RutaDocData = {
    nombre: nombre.trim(),
    zonaId: zonaId.trim(),
    empleadosIds: [],
    adminId,
    cajaRuta,
    cajasEmpleados,
    inversiones,
    capitalTotal,
    ganancias: 0,
    gastos: 0,
    perdidas: 0,
    fechaCreacion: now,
    ultimaActualizacion: now,
  };

  await runTransaction(firestore, async (tx) => {
    tx.set(ref, data);
    assertCapitalRuta(
      data.cajaRuta,
      data.cajasEmpleados,
      data.inversiones,
      data.capitalTotal
    );
  });

  console.log("[CAJA OK][crearRuta]", {
    cajaRuta,
    cajasEmpleados,
    inversiones,
    capitalTotal,
  });

  return ref.id;
}

/** Obtiene una ruta financiera tipada. */
export async function getRuta(
  empresaId: string,
  rutaId: string
): Promise<RutaFinanciera | null> {
  const firestore = ensureDb();
  if (!empresaId || !rutaId) return null;
  const ref = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );
  const snap = await getDoc(ref);
  return mapRutaSnapshot(snap);
}

/** Devuelve la primera ruta donde empleadosIds contiene empleadoId. */
export async function getRutaDeEmpleado(
  empresaId: string,
  empleadoId: string
): Promise<RutaFinanciera | null> {
  const firestore = ensureDb();
  if (!empresaId || !empleadoId) return null;
  const rutasCol = collection(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION
  );
  const q = query(rutasCol, where("empleadosIds", "array-contains", empleadoId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return mapRutaSnapshot(snap.docs[0] as any);
}

/**
 * Agrega un empleado a la ruta y actualiza sus documentos de usuario
 * (índice /users y subcolección /empresas/{id}/usuarios).
 */
export async function agregarEmpleadoARuta(
  empresaId: string,
  rutaId: string,
  empleadoId: string
): Promise<void> {
  const firestore = ensureDb();
  if (!empresaId || !rutaId || !empleadoId) {
    throw new Error("empresaId, rutaId y empleadoId son obligatorios");
  }

  const rutaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );

  const userIndexRef = doc(firestore, USERS_COLLECTION, empleadoId);
  const usuarioEmpresaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    USUARIOS_SUBCOLLECTION,
    empleadoId
  );

  const now = Timestamp.now();

  await runTransaction(firestore, async (tx) => {
    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists()) {
      throw new Error("Ruta no encontrada");
    }
    const rutaData = rutaSnap.data() as RutaDocData;
    tx.update(rutaRef, {
      empleadosIds: arrayUnion(empleadoId),
      ultimaActualizacion: now,
    });
    tx.set(
      userIndexRef,
      { rutaId, updatedAt: now },
      { merge: true } as any
    );
    tx.set(
      usuarioEmpresaRef,
      { rutaId, fechaCreacion: rutaData.fechaCreacion ?? now },
      { merge: true } as any
    );
  });
}

/**
 * Registra un nuevo préstamo impactando solo la ruta:
 * ruta.cajaRuta -= capitalPrestado
 * ruta.inversiones += capitalPrestado
 * ruta.capitalTotal SIN CAMBIO (se valida la ecuación).
 */
export async function registrarPrestamo(
  empresaId: string,
  rutaId: string,
  capitalPrestado: number
): Promise<void> {
  const firestore = ensureDb();
  if (!empresaId || !rutaId) throw new Error("empresaId y rutaId son obligatorios");
  if (capitalPrestado <= 0) {
    throw new Error("El capital prestado debe ser positivo");
  }

  const rutaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(rutaRef);
    if (!snap.exists()) throw new Error("Ruta no encontrada");
    const data = snap.data() as RutaDocData;
    let { cajaRuta, cajasEmpleados, inversiones, capitalTotal } = data;

    if (cajaRuta < capitalPrestado) {
      throw new Error("Saldo insuficiente en cajaRuta");
    }

    cajaRuta -= capitalPrestado;
    inversiones += capitalPrestado;

    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, capitalTotal);

    tx.update(rutaRef, {
      cajaRuta,
      inversiones,
      ultimaActualizacion: Timestamp.now(),
    });
  });
}

/**
 * Marca una cuota como incobrable y ajusta la ruta:
 * - cuota.estado = "incobrable"
 * - ruta.inversiones -= capitalCuota
 * - ruta.perdidas += capitalCuota
 * - ruta.capitalTotal -= capitalCuota
 */
export async function marcarIncobrable(
  empresaId: string,
  rutaId: string,
  cuotaId: string,
  prestamoId: string,
  capitalCuota: number
): Promise<void> {
  const firestore = ensureDb();
  if (!empresaId || !rutaId || !cuotaId || !prestamoId) {
    throw new Error("Parámetros obligatorios faltantes");
  }
  if (capitalCuota <= 0) {
    throw new Error("El capital de la cuota debe ser positivo");
  }

  const rutaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    RUTAS_SUBCOLLECTION,
    rutaId
  );

  const cuotaRef = doc(
    firestore,
    EMPRESAS_COLLECTION,
    empresaId,
    "prestamos",
    prestamoId,
    "cuotas",
    cuotaId
  );

  await runTransaction(firestore, async (tx) => {
    const rutaSnap = await tx.get(rutaRef);
    if (!rutaSnap.exists()) throw new Error("Ruta no encontrada");
    const data = rutaSnap.data() as RutaDocData;

    let { cajaRuta, cajasEmpleados, inversiones, capitalTotal, perdidas } = data;

    inversiones -= capitalCuota;
    perdidas += capitalCuota;
    capitalTotal -= capitalCuota;

    assertCapitalRuta(cajaRuta, cajasEmpleados, inversiones, capitalTotal);

    const cuotaSnap = await tx.get(cuotaRef);
    if (!cuotaSnap.exists()) {
      throw new Error("Cuota no encontrada");
    }

    tx.update(cuotaRef, { estado: "incobrable" });
    tx.update(rutaRef, {
      inversiones,
      perdidas,
      capitalTotal,
      ultimaActualizacion: Timestamp.now(),
    });
  });
}

