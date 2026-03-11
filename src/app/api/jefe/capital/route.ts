import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { EMPRESAS_COLLECTION, CAPITAL_SUBCOLLECTION, CAPITAL_DOC_ID } from "@/lib/empresas-db";

/** GET: obtiene el capital de empresa del jefe. Solo el jefe puede verlo. */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe") {
    return NextResponse.json({ error: "Solo el jefe puede ver el capital de empresa" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const capitalRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.uid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_DOC_ID);

  const snap = await capitalRef.get();
  if (!snap.exists) {
    return NextResponse.json({ monto: 0, updatedAt: null, historial: [] });
  }

  const data = snap.data()!;
  const updatedAt = data.updatedAt?.toDate?.();
  const historial = Array.isArray(data.historial) ? data.historial : [];
  return NextResponse.json({
    monto: typeof data.monto === "number" ? data.monto : 0,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    historial: historial.slice(0, 6).map((h: { montoAnterior?: number; montoNuevo?: number; at?: { toDate?: () => Date } }) => ({
      montoAnterior: typeof h.montoAnterior === "number" ? h.montoAnterior : 0,
      montoNuevo: typeof h.montoNuevo === "number" ? h.montoNuevo : 0,
      at: h.at?.toDate?.()?.toISOString?.() ?? null,
    })),
  });
}

/** PUT: actualiza el capital de empresa. Solo el jefe. Body: { monto: number } */
export async function PUT(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe") {
    return NextResponse.json({ error: "Solo el jefe puede actualizar el capital de empresa" }, { status: 403 });
  }

  const body = await request.json();
  const monto = typeof body.monto === "number" ? body.monto : Number(String(body.monto).replace(/,/g, ""));
  if (Number.isNaN(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto debe ser un número mayor a 0" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const now = new Date();
  const capitalRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.uid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_DOC_ID);

  const snap = await capitalRef.get();
  const montoAnterior = snap.exists && typeof snap.data()?.monto === "number" ? snap.data()!.monto : 0;
  const historialActual = Array.isArray(snap.data()?.historial) ? snap.data()!.historial : [];
  const nuevaEntrada = { montoAnterior, montoNuevo: monto, at: now };
  const historial = [nuevaEntrada, ...historialActual].slice(0, 6);

  await capitalRef.set(
    {
      monto,
      jefeUid: apiUser.uid,
      updatedAt: now,
      historial,
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    monto,
    updatedAt: now.toISOString(),
    historial: historial.map((h: { montoAnterior: number; montoNuevo: number; at: Date }) => ({
      montoAnterior: h.montoAnterior,
      montoNuevo: h.montoNuevo,
      at: h.at?.toISOString?.() ?? null,
    })),
  });
}

/** PATCH: limpia el historial de capital. Solo el jefe. Body: { clearHistorial: true } */
export async function PATCH(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe") {
    return NextResponse.json({ error: "Solo el jefe puede gestionar el capital" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.clearHistorial !== true) {
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const capitalRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.uid)
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_DOC_ID);

  await capitalRef.set({ historial: [] }, { merge: true });

  return NextResponse.json({ ok: true, historial: [] });
}
