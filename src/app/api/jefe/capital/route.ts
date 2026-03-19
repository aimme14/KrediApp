import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CAPITAL_SUBCOLLECTION,
  CAPITAL_DOC_ID,
} from "@/lib/empresas-db";
import {
  getCapitalEmpresa,
  setCapitalInicial,
  ajustarCapital,
  registrarSalida,
} from "@/lib/jefe-capital";

/** GET: obtiene el capital de empresa del jefe (capitalTotal, cajaEmpresa, capitalAsignadoAdmins). */
export async function GET(request: NextRequest) {
  try {
    const apiUser = await getApiUser(request);
    if (!apiUser) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (apiUser.role !== "jefe") {
      return NextResponse.json(
        { error: "Solo el jefe puede ver el capital de empresa" },
        { status: 403 }
      );
    }

    const db = getAdminFirestore();
    const doc = await getCapitalEmpresa(db, apiUser.uid);

    const historial = (doc.historial ?? []).slice(0, 6).map((h) => ({
      montoAnterior: h.montoAnterior,
      montoNuevo: h.montoNuevo,
      at: h.at instanceof Date ? h.at.toISOString() : null,
    }));

    return NextResponse.json({
      capitalTotal: doc.capitalTotal,
      cajaEmpresa: doc.cajaEmpresa,
      capitalAsignadoAdmins: doc.capitalAsignadoAdmins,
      monto: doc.capitalTotal,
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
      historial,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al obtener el capital" },
      { status: 500 }
    );
  }
}

/**
 * PUT: actualiza el capital.
 * Body:
 * - { monto: number }: establecer capital (inicial o nuevo total; si ya hay asignado a admins, monto debe ser >= asignado).
 * - { ajuste: number }: sumar/restar al capital (restar solo hasta lo disponible en caja empresa).
 * - { salida: number }: retiro de caja (reduce caja y capital total).
 */
export async function PUT(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe") {
    return NextResponse.json(
      { error: "Solo el jefe puede actualizar el capital de empresa" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const db = getAdminFirestore();

  if (typeof body.salida === "number" && body.salida > 0) {
    try {
      const doc = await registrarSalida(db, apiUser.uid, body.salida);
      return NextResponse.json({
        ok: true,
        capitalTotal: doc.capitalTotal,
        cajaEmpresa: doc.cajaEmpresa,
        capitalAsignadoAdmins: doc.capitalAsignadoAdmins,
        monto: doc.capitalTotal,
        updatedAt: doc.updatedAt.toISOString(),
        historial: (doc.historial ?? []).slice(0, 6).map((h) => ({
          montoAnterior: h.montoAnterior,
          montoNuevo: h.montoNuevo,
          at: h.at instanceof Date ? h.at.toISOString() : null,
        })),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al registrar salida" },
        { status: 400 }
      );
    }
  }

  if (typeof body.ajuste === "number" && body.ajuste !== 0) {
    try {
      const doc = await ajustarCapital(db, apiUser.uid, body.ajuste);
      return NextResponse.json({
        ok: true,
        capitalTotal: doc.capitalTotal,
        cajaEmpresa: doc.cajaEmpresa,
        capitalAsignadoAdmins: doc.capitalAsignadoAdmins,
        monto: doc.capitalTotal,
        updatedAt: doc.updatedAt.toISOString(),
        historial: (doc.historial ?? []).slice(0, 6).map((h) => ({
          montoAnterior: h.montoAnterior,
          montoNuevo: h.montoNuevo,
          at: h.at instanceof Date ? h.at.toISOString() : null,
        })),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al ajustar capital" },
        { status: 400 }
      );
    }
  }

  const monto =
    typeof body.monto === "number"
      ? body.monto
      : Number(String(body.monto ?? "").replace(/,/g, ""));
  if (Number.isNaN(monto) || monto < 0) {
    return NextResponse.json(
      { error: "El monto debe ser un número mayor o igual a 0" },
      { status: 400 }
    );
  }

  try {
    const doc = await setCapitalInicial(db, apiUser.uid, monto);
    return NextResponse.json({
      ok: true,
      capitalTotal: doc.capitalTotal,
      cajaEmpresa: doc.cajaEmpresa,
      capitalAsignadoAdmins: doc.capitalAsignadoAdmins,
      monto: doc.capitalTotal,
      updatedAt: doc.updatedAt.toISOString(),
      historial: (doc.historial ?? []).slice(0, 6).map((h) => ({
        montoAnterior: h.montoAnterior,
        montoNuevo: h.montoNuevo,
        at: h.at instanceof Date ? h.at.toISOString() : null,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar el capital" },
      { status: 400 }
    );
  }
}

/** PATCH: limpia el historial. Body: { clearHistorial: true } */
export async function PATCH(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "jefe") {
    return NextResponse.json(
      { error: "Solo el jefe puede gestionar el capital" },
      { status: 403 }
    );
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
