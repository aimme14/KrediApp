import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, CLIENTES_SUBCOLLECTION } from "@/lib/empresas-db";

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
  const col = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId).collection(CLIENTES_SUBCOLLECTION);

  let snap;
  if (apiUser.role === "empleado" && apiUser.rutaId) {
    snap = await col.where("rutaId", "==", apiUser.rutaId).get();
  } else {
    snap = await col.where("adminId", "==", apiUser.uid).get();
  }

  let list = snap.docs.map((d) => {
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
    };
  });

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

  await ref.set({
    nombre: nombre.trim(),
    ubicacion: (ubicacion ?? "").trim() || "",
    direccion: (direccion ?? "").trim() || "",
    telefono: (telefono ?? "").trim() || "",
    cedula: (cedula ?? "").trim() || "",
    rutaId: rutaFinal,
    adminId: apiUser.role === "empleado" && apiUser.adminId ? apiUser.adminId : apiUser.uid,
    prestamo_activo: false,
    moroso: false,
    fechaCreacion: now,
  });

  return NextResponse.json({ id: ref.id });
}
