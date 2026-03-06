import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, RUTAS_SUBCOLLECTION } from "@/lib/empresas-db";

/** GET: lista rutas de la empresa del usuario */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .get();

  const list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      nombre: data.nombre ?? "",
      ubicacion: data.ubicacion ?? "",
      base: data.base ?? "",
      descripcion: data.descripcion ?? "",
      adminId: data.adminId ?? "",
      empleadoId: data.empleadoId ?? "",
      fechaCreacion: data.fechaCreacion?.toDate?.() ?? null,
    };
  });

  list.sort((a, b) => (b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0) - (a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0));
  const rutas = list.map((r) => ({ ...r, fechaCreacion: r.fechaCreacion?.toISOString?.() ?? null }));

  return NextResponse.json({ rutas });
}

/** POST: crea una ruta */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { nombre, ubicacion } = body as { nombre?: string; ubicacion?: string };

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const now = new Date();
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .doc();

  await ref.set({
    nombre: nombre.trim(),
    ubicacion: (ubicacion ?? "").trim() || null,
    adminId: apiUser.uid,
    fechaCreacion: now,
  });

  return NextResponse.json({ id: ref.id });
}
