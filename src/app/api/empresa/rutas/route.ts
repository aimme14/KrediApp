import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, RUTAS_SUBCOLLECTION, USERS_COLLECTION } from "@/lib/empresas-db";

const COUNTERS_COLLECTION = "counters";

/** Obtiene el número de admin (001, 002...) desde adminNum o parseando codigo AD-001 */
function getAdminNumForRuta(data: Record<string, unknown> | undefined): number {
  if (data.adminNum != null && typeof data.adminNum === "number") return data.adminNum;
  const codigo = data.codigo;
  if (typeof codigo === "string") {
    const match = codigo.match(/^AD-(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

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
      codigo: data.codigo ?? undefined,
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

  // Número del admin para código RT-{adminNum}-{routeNum} (desde adminNum o codigo AD-001)
  const adminSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
  const adminNum = getAdminNumForRuta(adminSnap.data());

  // Secuencial de rutas por admin
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

  await ref.set({
    nombre: nombre.trim(),
    ubicacion: (ubicacion ?? "").trim() || null,
    adminId: apiUser.uid,
    fechaCreacion: now,
    codigo,
  });

  return NextResponse.json({ id: ref.id });
}
