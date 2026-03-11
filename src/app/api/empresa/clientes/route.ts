import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";

const COUNTERS_COLLECTION = "counters";

/** Parsea codigo de ruta RT-001-002 → { adminNumStr: "001", rutaNumStr: "002" } o null */
function parseRutaCodigo(codigo: string | undefined): { adminNumStr: string; rutaNumStr: string } | null {
  if (typeof codigo !== "string") return null;
  const match = codigo.match(/^RT-(\d{1,3})-(\d{1,3})$/);
  if (!match) return null;
  return {
    adminNumStr: match[1].padStart(3, "0"),
    rutaNumStr: match[2].padStart(3, "0"),
  };
}

/** GET: lista clientes. Empleado: solo los de su ruta. Admin/Jefe: ?rutaId= opcional */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rutaIdParam = searchParams.get("rutaId");
  const soloMorosos = searchParams.get("moroso") === "true";

  const db = getAdminFirestore();
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);
  const col = empresaRef.collection(CLIENTES_SUBCOLLECTION);

  let list: Array<{
    id: string;
    nombre: string;
    ubicacion: string;
    direccion: string;
    telefono: string;
    cedula: string;
    rutaId: string;
    adminId: string;
    prestamo_activo: boolean;
    moroso: boolean;
    fechaCreacion: Date | null;
    codigo?: string;
  }> = [];

  if (apiUser.role === "empleado" && apiUser.rutaId) {
    const snap = await col.where("rutaId", "==", apiUser.rutaId).get();
    list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        nombre: data.nombre ?? "",
        ubicacion: data.ubicacion ?? "",
        direccion: data.direccion ?? "",
        telefono: data.telefono ?? "",
        cedula: data.cedula ?? "",
        rutaId: data.rutaId ?? "",
        adminId: data.adminId ?? "",
        prestamo_activo: data.prestamo_activo === true,
        moroso: data.moroso === true,
        fechaCreacion: data.fechaCreacion?.toDate?.() ?? null,
        codigo: data.codigo ?? undefined,
      };
    });
  } else {
    // Admin/Jefe: clientes con adminId == uid Y además clientes de sus rutas (por si adminId quedó mal en algún cliente)
    const snapByAdmin = await col.where("adminId", "==", apiUser.uid).get();
    const rutasSnap = await empresaRef.collection(RUTAS_SUBCOLLECTION).where("adminId", "==", apiUser.uid).get();
    const rutaIds = rutasSnap.docs.map((d) => d.id);
    const byId = new Map<string, (typeof list)[0]>();
    /** Convierte valor Firestore (Timestamp o Date) a Date | null */
    const toDateOrNull = (v: unknown): Date | null => {
      if (v == null) return null;
      const t = v as { toDate?: () => Date };
      return typeof t.toDate === "function" ? t.toDate() : null;
    };
    const add = (d: { id: string; data: () => Record<string, unknown> | undefined }) => {
      const data = d.data();
      const item: (typeof list)[0] = {
        id: d.id,
        nombre: String(data?.nombre ?? ""),
        ubicacion: String(data?.ubicacion ?? ""),
        direccion: String(data?.direccion ?? ""),
        telefono: String(data?.telefono ?? ""),
        cedula: String(data?.cedula ?? ""),
        rutaId: String(data?.rutaId ?? ""),
        adminId: String(data?.adminId ?? ""),
        prestamo_activo: data?.prestamo_activo === true,
        moroso: data?.moroso === true,
        fechaCreacion: toDateOrNull(data?.fechaCreacion) ?? null,
        codigo: data?.codigo != null ? String(data.codigo) : undefined,
      };
      byId.set(d.id, item);
    };
    snapByAdmin.docs.forEach(add);
    if (rutaIds.length > 0) {
      const limitIn = 30;
      for (let i = 0; i < rutaIds.length; i += limitIn) {
        const chunk = rutaIds.slice(i, i + limitIn);
        const snapByRuta = await col.where("rutaId", "in", chunk).get();
        snapByRuta.docs.forEach(add);
      }
    }
    list = Array.from(byId.values());
  }

  if (apiUser.role !== "empleado" && rutaIdParam) {
    list = list.filter((c) => c.rutaId === rutaIdParam);
  }
  if (soloMorosos) {
    list = list.filter((c) => c.moroso);
  }
  list.sort((a, b) => (b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0) - (a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0));
  const clientes = list.map((c) => ({ ...c, fechaCreacion: c.fechaCreacion?.toISOString?.() ?? null }));

  return NextResponse.json({ clientes });
}

/** POST: crea un cliente. Empleado: se anexa a su ruta y adminId del trabajador */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { nombre, ubicacion, direccion, telefono, cedula, rutaId } = body as {
    nombre?: string;
    ubicacion?: string;
    direccion?: string;
    telefono?: string;
    cedula?: string;
    rutaId?: string;
  };

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const now = new Date();
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc();

  const rutaFinal = apiUser.role === "empleado" && apiUser.rutaId
    ? apiUser.rutaId
    : (rutaId && typeof rutaId === "string" && rutaId.trim() ? rutaId.trim() : null);
  if (!rutaFinal) {
    return NextResponse.json({ error: "La ruta es obligatoria" }, { status: 400 });
  }

  // Código CL-{adminNum}-{rutaNum}-{clienteNum}: desde codigo de la ruta + contador por ruta
  let adminNumStr = "000";
  let rutaNumStr = "000";
  const rutaSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc(rutaFinal)
    .get();
  const rutaData = rutaSnap.data();
  const parsed = parseRutaCodigo(rutaData?.codigo);

  // adminId del cliente: si es empleado, usar su adminId o el de la ruta (para que el admin vea estos clientes)
  const adminIdFinal =
    apiUser.role === "empleado"
      ? (apiUser.adminId || (rutaData?.adminId as string | undefined) || apiUser.uid)
      : apiUser.uid;
  if (parsed) {
    adminNumStr = parsed.adminNumStr;
    rutaNumStr = parsed.rutaNumStr;
  }

  const counterRef = db.collection(COUNTERS_COLLECTION).doc(`clientes_${rutaFinal}`);
  const clienteNum = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const lastNum = snap.exists ? (snap.data()?.lastNum ?? 0) : 0;
    const next = lastNum + 1;
    tx.set(counterRef, { lastNum: next }, { merge: true });
    return next;
  });
  const codigo = `CL-${adminNumStr}-${rutaNumStr}-${String(clienteNum).padStart(3, "0")}`;

  await ref.set({
    nombre: nombre.trim(),
    ubicacion: (ubicacion ?? "").trim() || "",
    direccion: (direccion ?? "").trim() || "",
    telefono: (telefono ?? "").trim() || "",
    cedula: (cedula ?? "").trim() || "",
    rutaId: rutaFinal,
    adminId: adminIdFinal,
    prestamo_activo: false,
    moroso: false,
    fechaCreacion: now,
    codigo,
  });

  return NextResponse.json({ id: ref.id });
}
