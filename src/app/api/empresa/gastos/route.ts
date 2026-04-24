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
import { descontarCajaEmpleado } from "@/lib/empleado-caja";
import { descontarCajaEmpresa } from "@/lib/jefe-capital";
import {
  getJornadaActivaEmpleado,
  registrarGastoJornadaDesdeApi,
} from "@/lib/jornada-gasto-admin";
import type { TipoGasto } from "@/types/firestore";

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
  } = body as {
    descripcion?: string;
    monto?: number;
    fecha?: string;
    tipo?: TipoGasto;
    evidencia?: string;
    alcance?: AlcanceGastoAdmin | string;
    rutaId?: string;
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
  const fechaDate = fecha ? new Date(fecha) : new Date();

  const db = getAdminFirestore();
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(apiUser.empresaId);

  const userSnap = await db.collection(USERS_COLLECTION).doc(apiUser.uid).get();
  const userData = userSnap.data();
  const creadoPorNombre =
    (typeof userData?.displayName === "string" && userData.displayName.trim()) ||
    (typeof userData?.email === "string" && userData.email.trim()) ||
    apiUser.uid;

  /** ── Jefe: caja empresa + gastosEmpresa ── */
  if (apiUser.role === "jefe") {
    if (monto > 0) {
      try {
        await descontarCajaEmpresa(
          db,
          apiUser.uid,
          monto,
          descripcion.trim()
        );
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Saldo insuficiente en la caja de la empresa",
          },
          { status: 400 }
        );
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

    return NextResponse.json({ id: ref.id });
  }

  /** ── Admin: caja admin + gastosAdministrador ── */
  if (apiUser.role === "admin") {
    const alcance: AlcanceGastoAdmin =
      alcanceBody === "ruta" ? "ruta" : "admin";
    let rutaIdValue = "";

    if (alcance === "ruta") {
      const rid =
        typeof rutaIdBody === "string" ? rutaIdBody.trim() : "";
      if (!rid) {
        return NextResponse.json(
          { error: "Debes elegir una ruta para un gasto de ruta" },
          { status: 400 }
        );
      }
      const rutaSnap = await empresaRef
        .collection(RUTAS_SUBCOLLECTION)
        .doc(rid)
        .get();
      if (!rutaSnap.exists) {
        return NextResponse.json({ error: "Ruta no encontrada" }, { status: 400 });
      }
      const adminRuta = rutaSnap.data()?.adminId;
      if (adminRuta !== apiUser.uid) {
        return NextResponse.json(
          { error: "Esta ruta no pertenece a tu administración" },
          { status: 403 }
        );
      }
      rutaIdValue = rid;
    }

    if (monto > 0) {
      try {
        await descontarCajaAdmin(
          db,
          apiUser.empresaId,
          apiUser.uid,
          monto,
          descripcion.trim()
        );
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Saldo insuficiente en base del administrador",
          },
          { status: 400 }
        );
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

    return NextResponse.json({ id: ref.id });
  }

  /** ── Empleado: descuenta caja del empleado (jornada activa → cajaActual + ruta; si no, cajaEmpleado en usuarios) ── */
  if (monto > 0) {
    const jornadaActiva = await getJornadaActivaEmpleado(
      db,
      apiUser.empresaId,
      apiUser.uid
    );
    if (jornadaActiva) {
      try {
        await registrarGastoJornadaDesdeApi(
          db,
          apiUser.empresaId,
          jornadaActiva.jornadaId,
          jornadaActiva.rutaId,
          monto,
          descripcion.trim(),
          tipoValido
        );
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "No se pudo registrar el gasto contra la base del empleado",
          },
          { status: 400 }
        );
      }
    } else {
      try {
        await descontarCajaEmpleado(
          db,
          apiUser.empresaId,
          apiUser.uid,
          monto,
          descripcion.trim()
        );
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : "Saldo insuficiente en la base del empleado",
          },
          { status: 400 }
        );
      }
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

  return NextResponse.json({ id: ref.id });
}
