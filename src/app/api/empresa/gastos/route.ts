import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminMessaging } from "@/lib/firebase-admin";
import { notifyAdminGastoEmpleado } from "@/lib/fcm-notify-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  GASTOS_EMPRESA_SUBCOLLECTION,
  GASTOS_ADMIN_SUBCOLLECTION,
  GASTOS_EMPLEADO_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";
import { applyDescontarCajaAdminEnTx, cajaAdminRef } from "@/lib/admin-capital";
import {
  applyDescontarCajaEmpresaEnTx,
  cajaEmpresaRef,
} from "@/lib/jefe-capital";
import { computeSumaCapitalAdminsDetalle } from "@/lib/capital-aggregates";
import {
  applyGastoOperativoEmpleadoEnTx,
  rutaEmpresaRef,
  usuarioEmpresaRef,
} from "@/lib/empleado-gasto-operativo-admin";
import { applyDescontarCajaRutaEnTx } from "@/lib/ruta-financiera-admin";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import {
  drainLedgerOutbox,
  enqueueLedgerOutboxInTx,
  type LedgerMovementSpec,
  type WalletType,
} from "@/lib/financial-ledger";
import {
  runIdempotent,
  type IdempotentOutcome,
} from "@/lib/financial-idempotency";
import type { TipoGasto } from "@/types/firestore";
import { fechaGastoDesdeStringCliente } from "@/lib/colombia-day-bounds";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

const DEFAULT_GASTOS_LIMIT = 100;
const MAX_GASTOS_LIMIT = 500;

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

  const limitParam = Number(new URL(request.url).searchParams.get("limit")) || DEFAULT_GASTOS_LIMIT;
  const limit = Math.min(Math.max(1, limitParam), MAX_GASTOS_LIMIT);

  const db = getAdminFirestore();
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);

  if (apiUser.role === "jefe") {
    const snap = await empresaRef
      .collection(GASTOS_EMPRESA_SUBCOLLECTION)
      .orderBy("fecha", "desc")
      .limit(limit)
      .get();
    const gastos = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const g = { ...mapGastoDoc(d.id, data, { alcance: "empresa" }), rol: "jefe" };
      return { ...g, fecha: g.fecha instanceof Date ? g.fecha.toISOString() : (g.fecha as string | null) ?? null };
    });
    return NextResponse.json({ gastos });
  }

  if (isAdminPanelApiUser(apiUser)) {
    const [nuevoSnap, empleadoSnap] = await Promise.all([
      empresaRef
        .collection(GASTOS_ADMIN_SUBCOLLECTION)
        .where("adminId", "==", apiUser.uid)
        .orderBy("fecha", "desc")
        .limit(limit)
        .get(),
      empresaRef
        .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
        .where("adminId", "==", apiUser.uid)
        .orderBy("fecha", "desc")
        .limit(limit)
        .get(),
    ]);

    const list: Array<Record<string, unknown>> = [];
    nuevoSnap.docs.forEach((d) => {
      list.push(mapGastoDoc(d.id, d.data() as Record<string, unknown>));
    });
    empleadoSnap.docs.forEach((d) => {
      list.push(mapGastoDoc(d.id, d.data() as Record<string, unknown>, { alcance: "empleado" }));
    });

    /** Backfill: rellena displayName/email para filas sin creadoPorNombre (datos legacy). */
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
        if (!String(g.creadoPorNombre ?? "").trim()) {
          g.creadoPorNombre = nombres[String(g.creadoPor)] ?? String(g.creadoPor ?? "");
        }
      });
    }

    // Merge de dos colecciones ordenadas → re-ordenar en memoria y limitar
    list.sort(
      (a, b) =>
        (b.fecha ? new Date(b.fecha as Date).getTime() : 0) -
        (a.fecha ? new Date(a.fecha as Date).getTime() : 0)
    );
    const gastos = list.slice(0, limit).map((g) => ({
      ...g,
      fecha: g.fecha instanceof Date ? g.fecha.toISOString() : (g.fecha as string | null) ?? null,
    }));
    return NextResponse.json({ gastos });
  }

  /** empleado */
  const nuevoSnap = await empresaRef
    .collection(GASTOS_EMPLEADO_SUBCOLLECTION)
    .where("empleadoId", "==", apiUser.uid)
    .orderBy("fecha", "desc")
    .limit(limit)
    .get();

  const gastos = nuevoSnap.docs.map((d) => {
    const g = mapGastoDoc(d.id, d.data() as Record<string, unknown>);
    return { ...g, fecha: g.fecha instanceof Date ? g.fecha.toISOString() : (g.fecha as string | null) ?? null };
  });
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
    creadoPorNombre: creadoPorNombreBody,
  } = body as {
    descripcion?: string;
    monto?: number;
    fecha?: string;
    tipo?: TipoGasto;
    evidencia?: string;
    alcance?: AlcanceGastoAdmin | string;
    rutaId?: string;
    idempotencyKey?: string;
    creadoPorNombre?: string;
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
  const creadoEn = Timestamp.now();

  const db = getAdminFirestore();
  const creadoPorNombre = creadoPorNombreBody?.trim() || apiUser.uid;

  const ctx: CrearGastoCtx = {
    db,
    apiUser,
    descripcion: descripcion.trim(),
    monto,
    fechaDate,
    creadoEn,
    tipo: tipoValido,
    evidencia: (evidencia ?? "").trim() || null,
    creadoPorNombre: creadoPorNombre.trim() || apiUser.uid,
  };

  const outcome = await runIdempotent({
    db,
    empresaId: apiUser.empresaId,
    key: idempotencyKey,
    endpoint: "gastos:create",
    uid: apiUser.uid,
    handler: () => {
      if (apiUser.role === "jefe") return crearGastoJefe(ctx);
      if (isAdminPanelApiUser(apiUser)) {
        return crearGastoAdmin(ctx, alcanceBody, rutaIdBody);
      }
      return crearGastoEmpleado(ctx);
    },
  });

  return NextResponse.json(outcome.payload, { status: outcome.status });
}

type ApiUser = NonNullable<Awaited<ReturnType<typeof getApiUser>>>;

type CrearGastoCtx = {
  db: ReturnType<typeof getAdminFirestore>;
  apiUser: ApiUser;
  descripcion: string;
  monto: number;
  fechaDate: Date;
  creadoEn: Timestamp;
  tipo: TipoGasto;
  evidencia: string | null;
  creadoPorNombre: string;
};

function mensajeError(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Drena el outbox tras el commit; un fallo deja el asiento pending, no pierde dinero. */
async function drenarLedger(
  db: CrearGastoCtx["db"],
  empresaId: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  try {
    await drainLedgerOutbox(db, empresaId, ids);
  } catch (e) {
    console.warn("[ledger] No se pudo drenar el gasto; queda pending en el outbox", e);
  }
}

/** ── Jefe: caja empresa + gastosEmpresa ── */
async function crearGastoJefe(ctx: CrearGastoCtx): Promise<IdempotentOutcome> {
  const { db, apiUser, monto } = ctx;
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);
  const ref = empresaRef.collection(GASTOS_EMPRESA_SUBCOLLECTION).doc();

  const gastoDoc = {
    descripcion: ctx.descripcion,
    monto,
    fecha: ctx.fechaDate,
    creadoEn: ctx.creadoEn,
    tipo: ctx.tipo,
    creadoPor: apiUser.uid,
    creadoPorNombre: ctx.creadoPorNombre,
    rol: "jefe",
    jefeUid: apiUser.uid,
    evidencia: ctx.evidencia,
  };

  // Solo alimenta los campos de display del historial de capital.
  const { sumaCapitalAdmins } =
    monto > 0
      ? await computeSumaCapitalAdminsDetalle(db, apiUser.uid)
      : { sumaCapitalAdmins: 0 };

  const cajaRef = cajaEmpresaRef(db, apiUser.uid);
  let ledgerIds: string[] = [];

  try {
    await db.runTransaction(async (tx) => {
      ledgerIds = [];
      const cajaEmpresaSnap = await tx.get(cajaRef);

      if (monto > 0) {
        const cajaDespues = applyDescontarCajaEmpresaEnTx(tx, {
          db,
          jefeUid: apiUser.uid,
          cajaEmpresaSnap,
          monto,
          sumaCapitalAdmins,
          now: new Date(),
        });

        ledgerIds = enqueueLedgerOutboxInTx(tx, db, apiUser.empresaId, [
          movimientoGasto({
            walletType: "empresa_caja",
            walletId: apiUser.empresaId,
            scope: "empresa",
            eventType: "gasto_empresa",
            balanceAfter: cajaDespues,
            gastoId: ref.id,
            ctx,
            metadata: { rol: "jefe" },
          }),
        ]);
      }

      tx.set(ref, gastoDoc);
    });
  } catch (e) {
    return {
      status: 400,
      payload: {
        error: mensajeError(e, "Saldo insuficiente en la caja de la empresa"),
      },
    };
  }

  await drenarLedger(db, apiUser.empresaId, ledgerIds);

  return { status: 200, payload: { id: ref.id } };
}

/** ── Admin: caja admin o caja ruta + gastosAdministrador ── */
async function crearGastoAdmin(
  ctx: CrearGastoCtx,
  alcanceBody: AlcanceGastoAdmin | string | undefined,
  rutaIdBody: string | undefined
): Promise<IdempotentOutcome> {
  const { db, apiUser, monto } = ctx;
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);
  const alcance: AlcanceGastoAdmin = alcanceBody === "ruta" ? "ruta" : "admin";

  let rutaIdValue = "";
  if (alcance === "ruta") {
    rutaIdValue = typeof rutaIdBody === "string" ? rutaIdBody.trim() : "";
    if (!rutaIdValue) {
      return {
        status: 400,
        payload: { error: "Debes elegir una ruta para un gasto de ruta" },
      };
    }
  }

  const ref = empresaRef.collection(GASTOS_ADMIN_SUBCOLLECTION).doc();
  const gastoDoc = {
    descripcion: ctx.descripcion,
    monto,
    fecha: ctx.fechaDate,
    creadoEn: ctx.creadoEn,
    tipo: ctx.tipo,
    creadoPor: apiUser.uid,
    creadoPorNombre: ctx.creadoPorNombre,
    rol: "admin",
    adminId: apiUser.uid,
    alcance,
    rutaId: rutaIdValue || null,
    evidencia: ctx.evidencia,
  };

  const rutaRef = rutaIdValue
    ? rutaEmpresaRef(db, apiUser.empresaId, rutaIdValue)
    : null;
  const adminRef = cajaAdminRef(db, apiUser.empresaId, apiUser.uid);
  let ledgerIds: string[] = [];

  try {
    await db.runTransaction(async (tx) => {
      ledgerIds = [];
      const now = new Date();

      if (monto > 0 && alcance === "ruta" && rutaRef) {
        const rutaSnap = await tx.get(rutaRef);
        const resultado = applyDescontarCajaRutaEnTx(tx, {
          rutaSnap,
          rutaRef,
          adminUid: apiUser.uid,
          monto,
          now,
        });
        ledgerIds = enqueueLedgerOutboxInTx(tx, db, apiUser.empresaId, [
          movimientoGasto({
            walletType: "ruta_caja",
            walletId: rutaIdValue,
            scope: "ruta",
            eventType: "gasto_ruta",
            balanceAfter: resultado.cajaRuta,
            gastoId: ref.id,
            ctx,
            metadata: { rol: "admin", alcance, rutaId: rutaIdValue },
          }),
        ]);
      } else if (monto > 0) {
        const adminSnap = await tx.get(adminRef);
        const cajaDespues = applyDescontarCajaAdminEnTx(tx, {
          adminRef,
          adminSnap,
          monto,
          now,
          acumularGastoPeriodo: true,
        });
        ledgerIds = enqueueLedgerOutboxInTx(tx, db, apiUser.empresaId, [
          movimientoGasto({
            walletType: "admin_caja",
            walletId: apiUser.uid,
            scope: "admin",
            eventType: "gasto_admin",
            balanceAfter: cajaDespues,
            gastoId: ref.id,
            ctx,
            metadata: { rol: "admin", alcance, rutaId: null },
          }),
        ]);
      } else if (alcance === "ruta" && rutaRef) {
        // Gasto sin monto: igual se valida la propiedad de la ruta.
        const rutaSnap = await tx.get(rutaRef);
        if (!rutaSnap.exists) throw new Error("Ruta no encontrada");
        if ((rutaSnap.data()?.adminId as string) !== apiUser.uid) {
          throw new Error("Esta ruta no pertenece a tu administración");
        }
      }

      tx.set(ref, gastoDoc);
    });
  } catch (e) {
    const msg = mensajeError(
      e,
      alcance === "ruta"
        ? "Saldo insuficiente en caja de la ruta"
        : "Saldo insuficiente en base del administrador"
    );
    const status = msg.includes("no pertenece a tu administración") ? 403 : 400;
    return { status, payload: { error: msg } };
  }

  if (rutaRef) {
    const after = await rutaRef.get();
    if (after.exists) {
      await upsertCapitalRutaSnapshot(
        db,
        apiUser.empresaId,
        rutaIdValue,
        after.data()!
      );
    }
  }

  await drenarLedger(db, apiUser.empresaId, ledgerIds);

  return { status: 200, payload: { id: ref.id } };
}

/** ── Empleado: caja empleado + cuadre de ruta + gastosEmpleado ── */
async function crearGastoEmpleado(ctx: CrearGastoCtx): Promise<IdempotentOutcome> {
  const { db, apiUser, monto } = ctx;
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);

  const rutaIdEmp = apiUser.rutaId?.trim();
  if (!rutaIdEmp) {
    return { status: 400, payload: { error: "No tienes ruta asignada" } };
  }

  const ref = empresaRef.collection(GASTOS_EMPLEADO_SUBCOLLECTION).doc();
  const gastoDoc = {
    descripcion: ctx.descripcion,
    monto,
    fecha: ctx.fechaDate,
    creadoEn: ctx.creadoEn,
    tipo: ctx.tipo,
    creadoPor: apiUser.uid,
    creadoPorNombre: ctx.creadoPorNombre,
    rol: "empleado",
    adminId: apiUser.adminId ?? "",
    empleadoId: apiUser.uid,
    rutaId: rutaIdEmp,
    evidencia: ctx.evidencia,
  };

  const usuarioRef = usuarioEmpresaRef(db, apiUser.empresaId, apiUser.uid);
  const rutaRef = rutaEmpresaRef(db, apiUser.empresaId, rutaIdEmp);
  let ledgerIds: string[] = [];

  try {
    await db.runTransaction(async (tx) => {
      ledgerIds = [];

      if (monto > 0) {
        const usuarioSnap = await tx.get(usuarioRef);
        const rutaSnap = await tx.get(rutaRef);
        const resultado = applyGastoOperativoEmpleadoEnTx(tx, {
          usuarioRef,
          usuarioSnap,
          rutaRef,
          rutaSnap,
          monto,
          now: Timestamp.now(),
        });
        ledgerIds = enqueueLedgerOutboxInTx(tx, db, apiUser.empresaId, [
          movimientoGasto({
            walletType: "empleado_caja",
            walletId: apiUser.uid,
            scope: "empleado",
            eventType: "gasto_empleado",
            balanceAfter: resultado.cajaEmpleado,
            gastoId: ref.id,
            ctx,
            metadata: { rol: "empleado", rutaId: rutaIdEmp },
          }),
        ]);
      }

      tx.set(ref, gastoDoc);
    });
  } catch (e) {
    return {
      status: 400,
      payload: {
        error: mensajeError(
          e,
          "No se pudo registrar el gasto contra la base del empleado"
        ),
      },
    };
  }

  const rutaAfter = await rutaRef.get();
  if (rutaAfter.exists) {
    await upsertCapitalRutaSnapshot(
      db,
      apiUser.empresaId,
      rutaIdEmp,
      rutaAfter.data()!
    );
  }

  await drenarLedger(db, apiUser.empresaId, ledgerIds);

  const adminUid = (apiUser.adminId ?? "").trim();
  if (!adminUid) {
    console.warn(
      "[gastos] Empleado sin adminId en perfil; no se envía push FCM. Asigna administrador al trabajador en Firestore/users."
    );
  } else {
    void (async () => {
      try {
        await notifyAdminGastoEmpleado(getAdminMessaging(), {
          adminUid,
          empleadoNombre: ctx.creadoPorNombre,
          monto,
          descripcion: ctx.descripcion,
          gastoId: ref.id,
          empresaId: apiUser.empresaId,
        });
      } catch (e) {
        console.warn("[gastos] notify admin FCM:", e);
      }
    })();
  }

  return { status: 200, payload: { id: ref.id } };
}

function movimientoGasto(params: {
  walletType: WalletType;
  walletId: string;
  scope: "empresa" | "admin" | "ruta" | "empleado";
  eventType: string;
  balanceAfter: number;
  gastoId: string;
  ctx: CrearGastoCtx;
  metadata: Record<string, unknown>;
}): LedgerMovementSpec {
  const { ctx } = params;
  return {
    direction: "debit",
    walletType: params.walletType,
    walletId: params.walletId,
    amount: ctx.monto,
    balanceAfter: params.balanceAfter,
    eventType: params.eventType,
    scope: params.scope,
    createdBy: ctx.apiUser.uid,
    relatedEntityType: "gasto",
    relatedEntityId: params.gastoId,
    metadata: {
      gastoId: params.gastoId,
      tipo: ctx.tipo,
      descripcion: ctx.descripcion,
      ...params.metadata,
    },
    operationId: `${params.eventType}:${params.gastoId}`,
  };
}
