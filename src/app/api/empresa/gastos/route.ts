import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, GASTOS_SUBCOLLECTION } from "@/lib/empresas-db";
import type { TipoGasto } from "@/types/firestore";

/** GET: lista gastos. Empleado: los que él generó. Admin/Jefe: los suyos */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const col = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId).collection(GASTOS_SUBCOLLECTION);
  const snap =
    apiUser.role === "empleado"
      ? await col.where("empleadoId", "==", apiUser.uid).get()
      : await col.where("adminId", "==", apiUser.uid).get();

  const list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      descripcion: data.descripcion ?? "",
      monto: data.monto ?? 0,
      fecha: data.fecha?.toDate?.() ?? null,
      tipo: data.tipo ?? "otro",
      creadoPor: data.creadoPor ?? "",
      rol: data.rol ?? "admin",
      rutaId: data.rutaId ?? "",
      adminId: data.adminId ?? "",
      empleadoId: data.empleadoId ?? "",
      evidencia: data.evidencia ?? "",
    };
  });

  list.sort((a, b) => (b.fecha ? new Date(b.fecha).getTime() : 0) - (a.fecha ? new Date(a.fecha).getTime() : 0));
  const gastos = list.map((g) => ({ ...g, fecha: g.fecha?.toISOString?.() ?? null }));

  return NextResponse.json({ gastos });
}

/** POST: crea un gasto operativo */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { descripcion, monto, fecha, tipo, evidencia } = body as {
    descripcion?: string;
    monto?: number;
    fecha?: string;
    tipo?: TipoGasto;
    evidencia?: string;
  };

  if (!descripcion || typeof descripcion !== "string" || !descripcion.trim()) {
    return NextResponse.json({ error: "El motivo/descripción es obligatorio" }, { status: 400 });
  }
  if (typeof monto !== "number" || monto < 0) {
    return NextResponse.json({ error: "Monto debe ser un número mayor o igual a 0" }, { status: 400 });
  }

  const tipoValido: TipoGasto = tipo === "transporte" || tipo === "alimentacion" ? tipo : "otro";
  const fechaDate = fecha ? new Date(fecha) : new Date();

  const db = getAdminFirestore();
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(GASTOS_SUBCOLLECTION)
    .doc();

  const isEmpleado = apiUser.role === "empleado";
  await ref.set({
    descripcion: descripcion.trim(),
    monto,
    fecha: fechaDate,
    tipo: tipoValido,
    creadoPor: apiUser.uid,
    rol: isEmpleado ? "empleado" : "admin",
    adminId: isEmpleado && apiUser.adminId ? apiUser.adminId : apiUser.uid,
    empleadoId: isEmpleado ? apiUser.uid : null,
    evidencia: (evidencia ?? "").trim() || null,
  });

  return NextResponse.json({ id: ref.id });
}
