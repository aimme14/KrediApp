import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  getCapitalEmpresa,
  setCapitalInicial,
  ajustarCapital,
  registrarSalida,
  clearCapitalEmpresaFlujo,
} from "@/lib/jefe-capital";

/** GET: capital de empresa (fórmula nueva + desglose). */
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

    const historial = (doc.historial ?? []).map((h) => ({
      id: h.id,
      tipo: h.tipo,
      montoAnterior: h.montoAnterior,
      montoNuevo: h.montoNuevo,
      at: h.at instanceof Date ? h.at.toISOString() : null,
    }));

    return NextResponse.json({
      capitalEmpresa: doc.capitalEmpresa,
      capitalTotal: doc.capitalEmpresa,
      cajaEmpresa: doc.cajaEmpresa,
      gastosEmpresa: doc.gastosEmpresa,
      sumaCapitalAdmins: doc.sumaCapitalAdmins,
      capitalAsignadoAdmins: doc.sumaCapitalAdmins,
      monto: doc.capitalEmpresa,
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
 * PUT: actualiza caja / capital de empresa.
 * Body:
 * - { monto: number }: capital de empresa objetivo (capitalEmpresa); se deriva cajaEmpresa.
 * - { ajuste: number }: sumar/restar solo a caja empresa.
 * - { salida: number }: retiro de caja empresa.
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

  const jsonDoc = async (doc: Awaited<ReturnType<typeof getCapitalEmpresa>>) => {
    const historial = (doc.historial ?? []).map((h) => ({
      id: h.id,
      tipo: h.tipo,
      montoAnterior: h.montoAnterior,
      montoNuevo: h.montoNuevo,
      at: h.at instanceof Date ? h.at.toISOString() : null,
    }));
    return {
      ok: true,
      capitalEmpresa: doc.capitalEmpresa,
      capitalTotal: doc.capitalEmpresa,
      cajaEmpresa: doc.cajaEmpresa,
      gastosEmpresa: doc.gastosEmpresa,
      sumaCapitalAdmins: doc.sumaCapitalAdmins,
      capitalAsignadoAdmins: doc.sumaCapitalAdmins,
      monto: doc.capitalEmpresa,
      updatedAt: doc.updatedAt.toISOString(),
      historial,
    };
  };

  if (typeof body.salida === "number" && body.salida > 0) {
    try {
      const doc = await registrarSalida(db, apiUser.uid, body.salida);
      return NextResponse.json(await jsonDoc(doc));
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
      return NextResponse.json(await jsonDoc(doc));
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
    return NextResponse.json(await jsonDoc(doc));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar el capital" },
      { status: 400 }
    );
  }
}

/** PATCH: elimina el flujo de movimientos bajo cajaEmpresa. Body: { clearHistorial: true } */
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
  await clearCapitalEmpresaFlujo(db, apiUser.uid);

  return NextResponse.json({ ok: true, historial: [] });
}
