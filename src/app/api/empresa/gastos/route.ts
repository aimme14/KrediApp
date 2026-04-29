import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  GASTOS_SUBCOLLECTION,
  GASTOS_EMPRESA_SUBCOLLECTION,
  GASTOS_ADMIN_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import { descontarCajaAdmin } from "@/lib/admin-capital";
import { descontarCajaEmpresa } from "@/lib/jefe-capital";
import { registrarGastoOperativoEmpleadoDesdeApi } from "@/lib/empleado-gasto-operativo-admin";
import { descontarCajaRutaAdmin } from "@/lib/ruta-financiera-admin";
import { recordDebitMovement, type WalletType } from "@/lib/financial-ledger";
import {
  startIdempotentOperation,
  finishIdempotentOperation,
} from "@/lib/financial-idempotency";
import type { TipoGasto } from "@/types/firestore";
import { fechaGastoDesdeStringCliente } from "@/lib/colombia-day-bounds";

export type AlcanceGastoAdmin = "ruta" | "admin";

function mapGastoDoc(
  id: string,
  data: Record<string, unknown>,
  extras: Record<string, unknown> = {}
) {
  return {
    id,
    descripcion: data.descripcion ?? "",
    monto: data.monto ?? 0,
    fecha:
      typeof (data.fecha as { toDate?: () => Date })?.toDate === "function"
        ? (data.fecha as { toDate: () => Date }).toDate()
        : null,
    tipo: data.tipo ?? "otro",
    creadoPor: data.creadoPor ?? "",
    creadoPorNombre: data.creadoPorNombre ?? "",
    rol: data.rol ?? "admin",
    rutaId: data.rutaId ?? "",
    adminId: data.adminId ?? "",
    empleadoId: data.empleadoId ?? "",
    evidencia: data.evidencia ?? "",
    alcance: (data.alcance as string) ?? "",
    ...extras,
  };
}

/** GET: lista gastos según rol y subcolección. */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);

  if (apiUser.role === "jefe") {
    const snap = await empresaRef.collection(GASTOS_EMPRESA_SUBCOLLECTION).get();
    const list = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        ...mapGastoDoc(d.id, data, { alcance: "empresa" }),
        rol: "jefe",
      };
    });
    list.sort(
      (a, b) =>
        (b.fecha ? new Date(b.fecha).getTime() : 0) -
        (a.fecha ? new Date(a.fecha).getTime() : 0)
    );
    const gastos = list.map((g) => ({
      ...g,
      fecha: g.fecha?.toISOString?.() ?? null,
    }));
    return NextResponse.json({ gastos });
  }

  if (apiUser.role === "admin") {
    const [legacySnap, nuevoSnap] = await Promise.all([
      empresaRef
        .collection(GASTOS_SUBCOLLECTION)
        .where("adminId", "==", apiUser.uid)
        .get(),
      empresaRef
        .collection(GASTOS_ADMIN_SUBCOLLECTION)
        .where("adminId", "==", apiUser.uid)
        .get(),
    ]);

    const list: Array<Record<string, unknown>> = [];
    legacySnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      list.push(
        mapGastoDoc(d.id, data, {
          alcance: data.rutaId ? "ruta" : "admin",
        })
      );
    });
    nuevoSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      list.push(mapGastoDoc(d.id, data));
    });

    const sinNombre = list.filter((g) => !(g.creadoPorNombre as string)?.trim());
    if (sinNombre.length > 0) {
      const uids = Array.from(
        new Set(sinNombre.map((g) => g.creadoPor).filter(Boolean))
      ) as string[];
      const nombres: Record<string, string> = {};
      await Promise.all(
        uids.map(async (uid) => {
          const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
          const u = userSnap.data();
          nombres[uid] =
            (u?.displayName as string)?.trim() ||
            (u?.email as string)?.trim() ||
            uid;
        })
      );
      list.forEach((g) => {
        const gn = String(g.creadoPorNombre ?? "").trim();
        if (!gn) {
          g.creadoPorNombre =
            nombres[String(g.creadoPor)] ?? String(g.creadoPor ?? "");
        }
      });
    }

    list.sort(
      (a, b) =>
        (b.fecha ? new Date(b.fecha as Date).getTime() : 0) -
        (a.fecha ? new Date(a.fecha as Date).getTime() : 0)
    );
    const gastos = list.map((g) => ({
      ...g,
      fecha:
        g.fecha instanceof Date
          ? g.fecha.toISOString()
          : (g.fecha as string | null) ?? null,
    }));
    return NextResponse.json({ gastos });
  }

  /** empleado */
  const [legacySnap, nuevoSnap] = await Promise.all([
    empresaRef
      .collection(GASTOS_SUBCOLLECTION)
      .where("empleadoId", "==", apiUser.uid)
      .get(),
    empresaRef
      .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
      .where("empleadoId", "==", apiUser.uid)
      .get(),
  ]);

  const list: Array<Record<string, unknown>> = [];
  legacySnap.docs.forEach((d) =>
    list.push(mapGastoDoc(d.id, d.data() as Record<string, unknown>))
  );
  nuevoSnap.docs.forEach((d) =>
    list.push(mapGastoDoc(d.id, d.data() as Record<string, unknown>))
  );

  list.sort(
    (a, b) =>
      (b.fecha ? new Date(b.fecha as Date).getTime() : 0) -
      (a.fecha ? new Date(a.fecha as Date).getTime() : 0)
  );
  const gastos = list.map((g) => ({
    ...g,
    fecha:
      g.fecha instanceof Date
        ? g.fecha.toISOString()
        : (g.fecha as string | null) ?? null,
  }));
  return NextResponse.json({ gastos });
}

/** POST: crea un gasto operativo (subcolección según rol). */
export async function POST(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const {
    descripcion,
    monto,
    fecha,
    tipo,
    evidencia,
    alcance: alcanceBody,
    rutaId: rutaIdBody,
    idempotencyKey,
  } = body as {
    descripcion?: string;
    monto?: number;
    fecha?: string;
    tipo?: TipoGasto;
    evidencia?: string;
    alcance?: AlcanceGastoAdmin | string;
    rutaId?: string;
    idempotencyKey?: string;
  };

  if (!descripcion || typeof descripcion !== "string" || !descripcion.trim()) {
    return NextResponse.json(
      { error: "El motivo/descripción es obligatorio" },
      { status: 400 }
    );
  }
  if (typeof monto !== "number" || monto < 0) {
    return NextResponse.json(
      { error: "Monto debe ser un número mayor o igual a 0" },
      { status: 400 }
    );
  }

  const tipoValido: TipoGasto =
    tipo === "transporte" || tipo === "alimentacion" ? tipo : "otro";
  const fechaDate = fecha ? fechaGastoDesdeStringCliente(fecha) : new Date();

  const db = getAdminFirestore();
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);
  const idem = await startIdempotentOperation({
    db,
    empresaId: apiUser.empresaId,
    key: idempotencyKey,
    endpoint: "gastos:create",
    uid: apiUser.uid,
  });
  if (idem.replay) {
    return NextResponse.json(idem.payload, { status: idem.status });
  }
  const finalize = async (status: number, payload: Record<string, unknown>) => {
    await finishIdempotentOperation({
      db,
      empresaId: apiUser.empresaId,
      key: idempotencyKey,
      result: { ok: status < 400, status, payload },
    });
    return NextResponse.json(payload, { status });
  };

  const userSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
  const userData = userSnap.data();
  const creadoPorNombre =
    (typeof userData?.displayName === "string" && userData.displayName.trim()) ||
    (typeof userData?.email === "string" && userData.email.trim()) ||
    apiUser.uid;

  /** ── Jefe: caja empresa + gastosEmpresa ── */
  if (apiUser.role === "jefe") {
    let cajaEmpresaDespues: number | null = null;
    if (monto > 0) {
      try {
        cajaEmpresaDespues = await descontarCajaEmpresa(
          db,
          apiUser.uid,
          monto,
          descripcion.trim()
        );
      } catch (e) {
        return finalize(400, {
          error:
            e instanceof Error
              ? e.message
              : "Saldo insuficiente en la caja de la empresa",
        });
      }
    }

    const ref = empresaRef.collection(GASTOS_EMPRESA_SUBCOLLECTION).doc();
    await ref.set({
      descripcion: descripcion.trim(),
      monto,
      fecha: fechaDate,
      tipo: tipoValido,
      creadoPor: apiUser.uid,
      creadoPorNombre: creadoPorNombre.trim() || apiUser.uid,
      rol: "jefe",
      jefeUid: apiUser.uid,
      evidencia: (evidencia ?? "").trim() || null,
    });

    if (monto > 0 && typeof cajaEmpresaDespues === "number") {
      try {
        await recordDebitMovement({
          db,
          empresaId: apiUser.empresaId,
          walletType: "empresa_caja",
          walletId: apiUser.empresaId,
          amount: monto,
          balanceAfter: cajaEmpresaDespues,
          eventType: "gasto_empresa",
          scope: "empresa",
          createdBy: apiUser.uid,
          relatedEntityType: "gasto",
          relatedEntityId: ref.id,
          metadata: {
            gastoId: ref.id,
            rol: "jefe",
            tipo: tipoValido,
            descripcion: descripcion.trim(),
          },
          operationId: `gasto_empresa:${ref.id}`,
        });
      } catch (e) {
        console.warn("[ledger] No se pudo registrar movimiento de gasto empresa", e);
      }
    }

    const payload = { id: ref.id };
    return finalize(200, payload);
  }

  /** ── Admin: caja admin + gastosAdministrador ── */
  if (apiUser.role === "admin") {
    const alcance: AlcanceGastoAdmin =
      alcanceBody === "ruta" ? "ruta" : "admin";
    let rutaIdValue = "";
    let ledgerWalletType: WalletType | null = null;
    let ledgerWalletId = "";
    let ledgerBalanceAfter: number | null = null;
    let ledgerEventType = "";
    let ledgerScope: "admin" | "ruta" = "admin";

    if (alcance === "ruta") {
      const rid =
        typeof rutaIdBody === "string" ? rutaIdBody.trim() : "";
      if (!rid) {
        return finalize(400, { error: "Debes elegir una ruta para un gasto de ruta" });
      }
      const rutaSnap = await empresaRef
        .collection(RUTAS_SUBCOLLECTION)
        .doc(rid)
        .get();
      if (!rutaSnap.exists) {
        return finalize(400, { error: "Ruta no encontrada" });
      }
      const adminRuta = rutaSnap.data()?.adminId;
      if (adminRuta !== apiUser.uid) {
        return finalize(403, { error: "Esta ruta no pertenece a tu administración" });
      }
      rutaIdValue = rid;
    }

    if (monto > 0) {
      try {
        if (alcance === "ruta") {
          const result = await descontarCajaRutaAdmin(
            db,
            apiUser.empresaId,
            apiUser.uid,
            rutaIdValue,
            monto
          );
          ledgerWalletType = "ruta_caja";
          ledgerWalletId = rutaIdValue;
          ledgerBalanceAfter = result.cajaRuta;
          ledgerEventType = "gasto_ruta";
          ledgerScope = "ruta";
        } else {
          const nuevaCajaAdmin = await descontarCajaAdmin(
            db,
            apiUser.empresaId,
            apiUser.uid,
            monto,
            descripcion.trim()
          );
          ledgerWalletType = "admin_caja";
          ledgerWalletId = apiUser.uid;
          ledgerBalanceAfter = nuevaCajaAdmin;
          ledgerEventType = "gasto_admin";
          ledgerScope = "admin";
        }
      } catch (e) {
        return finalize(400, {
          error:
            e instanceof Error
              ? e.message
              : alcance === "ruta"
                ? "Saldo insuficiente en caja de la ruta"
                : "Saldo insuficiente en base del administrador",
        });
      }
    }

    const ref = empresaRef.collection(GASTOS_ADMIN_SUBCOLLECTION).doc();
    await ref.set({
      descripcion: descripcion.trim(),
      monto,
      fecha: fechaDate,
      tipo: tipoValido,
      creadoPor: apiUser.uid,
      creadoPorNombre: creadoPorNombre.trim() || apiUser.uid,
      rol: "admin",
      adminId: apiUser.uid,
      alcance,
      rutaId: rutaIdValue || null,
      evidencia: (evidencia ?? "").trim() || null,
    });

    if (
      monto > 0 &&
      ledgerWalletType &&
      ledgerWalletId &&
      typeof ledgerBalanceAfter === "number"
    ) {
      try {
        await recordDebitMovement({
          db,
          empresaId: apiUser.empresaId,
          walletType: ledgerWalletType,
          walletId: ledgerWalletId,
          amount: monto,
          balanceAfter: ledgerBalanceAfter,
          eventType: ledgerEventType,
          scope: ledgerScope,
          createdBy: apiUser.uid,
          relatedEntityType: "gasto",
          relatedEntityId: ref.id,
          metadata: {
            gastoId: ref.id,
            rol: "admin",
            alcance,
            rutaId: rutaIdValue || null,
            tipo: tipoValido,
            descripcion: descripcion.trim(),
          },
          operationId: `gasto_admin:${ref.id}`,
        });
      } catch (e) {
        console.warn("[ledger] No se pudo registrar movimiento de gasto admin", e);
      }
    }

    const payload = { id: ref.id };
    return finalize(200, payload);
  }

  /** ── Empleado: descuenta cajaEmpleado y cuadra la ruta (cajasEmpleados / capitalTotal) ── */
  const rutaIdEmp = apiUser.rutaId?.trim();
  if (!rutaIdEmp) {
    return finalize(400, { error: "No tienes ruta asignada" });
  }
  if (monto > 0) {
    try {
      await registrarGastoOperativoEmpleadoDesdeApi(
        db,
        apiUser.empresaId,
        apiUser.uid,
        rutaIdEmp,
        monto,
        descripcion.trim(),
        tipoValido
      );
    } catch (e) {
      return finalize(400, {
        error:
          e instanceof Error
            ? e.message
            : "No se pudo registrar el gasto contra la base del empleado",
      });
    }
  }

  const ref = empresaRef.collection(GASTOS_EMPLEADO_SUBCOLLECTION).doc();
  await ref.set({
    descripcion: descripcion.trim(),
    monto,
    fecha: fechaDate,
    tipo: tipoValido,
    creadoPor: apiUser.uid,
    creadoPorNombre: creadoPorNombre.trim() || apiUser.uid,
    rol: "empleado",
    adminId: apiUser.adminId ?? "",
    empleadoId: apiUser.uid,
    evidencia: (evidencia ?? "").trim() || null,
  });

  const payload = { id: ref.id };
  return finalize(200, payload);
}
