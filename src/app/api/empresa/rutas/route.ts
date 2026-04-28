import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, RUTAS_SUBCOLLECTION, USERS_COLLECTION } from "@/lib/empresas-db";
import {
  empleadoAsignadoEnDocumentoRuta,
  rutaIdsConEmpleadoEnUsuarios,
} from "@/lib/ruta-empleado-ocupada";
import { descontarCajaAdmin } from "@/lib/admin-capital";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

const COUNTERS_COLLECTION = "counters";

/** Obtiene el número de admin (001, 002...) desde adminNum o parseando codigo AD-001 */
function getAdminNumForRuta(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  if (data.adminNum != null && typeof data.adminNum === "number") return data.adminNum;
  const codigo = data.codigo;
  if (typeof codigo === "string") {
    const match = codigo.match(/^AD-(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

/** GET: lista rutas (admin: solo las suyas por adminId; jefe/empleado: todas las de la empresa) */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const sinEmpleado =
    request.nextUrl.searchParams.get("sinEmpleado") === "true" ||
    request.nextUrl.searchParams.get("sinEmpleado") === "1";

  const rutasCol = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION);

  const snap =
    apiUser.role === "admin"
      ? await rutasCol.where("adminId", "==", apiUser.uid).get()
      : await rutasCol.get();

  let rutaIdsOcupadasUsuarios: Set<string> | null = null;
  if (sinEmpleado) {
    rutaIdsOcupadasUsuarios = await rutaIdsConEmpleadoEnUsuarios(db, apiUser.empresaId);
  }

  const docsFiltrados = sinEmpleado
    ? snap.docs.filter((d) => {
        const data = d.data() as Record<string, unknown>;
        if (empleadoAsignadoEnDocumentoRuta(data)) return false;
        if (rutaIdsOcupadasUsuarios!.has(d.id)) return false;
        return true;
      })
    : snap.docs;

  const list = docsFiltrados.map((d) => {
    const data = d.data();
    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const cajasEmpleados = typeof data.cajasEmpleados === "number" ? data.cajasEmpleados : 0;
    const inversiones = typeof data.inversiones === "number" ? data.inversiones : 0;
    const ganancias = typeof data.ganancias === "number" ? data.ganancias : 0;
    const perdidas = typeof data.perdidas === "number" ? data.perdidas : 0;
    const capitalTotalRaw =
      typeof data.capitalTotal === "number"
        ? data.capitalTotal
        : computeCapitalTotalRutaDesdeSaldos({
            cajaRuta,
            cajasEmpleados,
            inversiones,
            perdidas,
          });
    const rutaOperativa =
      typeof data.rutaOperativa === "boolean" ? data.rutaOperativa : true;
    return {
      id: d.id,
      nombre: data.nombre ?? "",
      ubicacion: data.ubicacion ?? "",
      base: data.base ?? "",
      descripcion: data.descripcion ?? "",
      adminId: data.adminId ?? "",
      empleadoId: data.empleadoId ?? "",
      fechaCreacion: data.fechaCreacion?.toDate?.() ?? null,
      codigo: data.codigo ?? undefined,
      cajaRuta,
      cajasEmpleados,
      inversiones,
      ganancias,
      capitalTotal: Math.round(capitalTotalRaw * 100) / 100,
      /** false = trabajadores no pueden operar hasta que el admin abra la ruta */
      rutaOperativa,
    };
  });

  list.sort((a, b) => (b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0) - (a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0));
  const rutas = list.map((r) => ({ ...r, fechaCreacion: r.fechaCreacion?.toISOString?.() ?? null }));

  return NextResponse.json({ rutas });
}

/** POST: crea una ruta. Opcional: capitalInicial (sale de la base del admin). */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { nombre, ubicacion, capitalInicial: capitalInicialBody } = body as {
    nombre?: string;
    ubicacion?: string;
    capitalInicial?: number;
  };

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const capitalInicial = typeof capitalInicialBody === "number" && capitalInicialBody >= 0
    ? capitalInicialBody
    : 0;

  const db = getAdminFirestore();
  const now = new Date();

  if (capitalInicial > 0) {
    try {
      await descontarCajaAdmin(db, apiUser.empresaId, apiUser.uid, capitalInicial, "Creación de ruta");
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Saldo insuficiente en base del administrador" },
        { status: 400 }
      );
    }
  }

  const adminSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
  const adminNum = getAdminNumForRuta(adminSnap.data());

  const counterRef = db.collection(COUNTERS_COLLECTION).doc(`rutas_${apiUser.uid}`);
  const routeNum = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const lastNum = snap.exists ? (snap.data()?.lastNum ?? 0) : 0;
    const next = lastNum + 1;
    tx.set(counterRef, { lastNum: next }, { merge: true });
    return next;
  });

  const codigo = `RT-${String(adminNum).padStart(3, "0")}-${String(routeNum).padStart(3, "0")}`;

  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc();

  const zonaId = (ubicacion ?? "").trim() || "";
  await ref.set({
    nombre: nombre.trim(),
    ubicacion: zonaId || null,
    base: null,
    descripcion: null,
    adminId: apiUser.uid,
    fechaCreacion: now,
    codigo,
    zonaId,
    empleadosIds: [],
    cajaRuta: capitalInicial,
    cajasEmpleados: 0,
    inversiones: 0,
    capitalTotal: capitalInicial,
    ganancias: 0,
    gastos: 0,
    perdidas: 0,
    ultimaActualizacion: now,
    /** Por defecto abierta; el admin puede cerrar manualmente */
    rutaOperativa: true,
  });

  await upsertCapitalRutaSnapshot(db, apiUser.empresaId, ref.id, {
    nombre: nombre.trim(),
    adminId: apiUser.uid,
    cajaRuta: capitalInicial,
    cajasEmpleados: 0,
    inversiones: 0,
    capitalTotal: capitalInicial,
    ganancias: 0,
    perdidas: 0,
  });

  return NextResponse.json({ id: ref.id });
}
