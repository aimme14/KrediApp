import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { canCreateRole } from "@/types/roles";
import type { Role } from "@/types/roles";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";
import {
  EMPRESAS_COLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
  RUTAS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { asignarCapitalAAdmin } from "@/lib/jefe-capital";
import { persistAggregatedCapitalDocs } from "@/lib/capital-aggregates";
import { parseMontoBase } from "@/lib/parse-monto-base";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";

/** Colección de contadores para códigos secuenciales (JF-001, AD-001 por jefe) */
const COUNTERS_COLLECTION = "counters";
const JEFES_COUNTER_ID = "jefes";
/** ID del contador de admins: por jefe, ej. counters/admins_{jefeUid} */
function getAdminsCounterId(jefeUid: string): string {
  return `admins_${jefeUid}`;
}

/** Mapea Role de la app a rol en Firestore (empleado vs trabajador) */
function toRolFirestore(role: Role): "jefe" | "admin" | "empleado" {
  if (role === "trabajador") return "empleado";
  if (role === "jefe" || role === "admin") return role;
  return "empleado";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, displayName, role, createdByUid, cedula, lugar, direccion, telefono, base, rutaId, adminId, montoAsignado } = body as {
      email: string;
      password: string;
      displayName?: string;
      role: Role;
      createdByUid: string;
      cedula?: string;
      lugar?: string;
      direccion?: string;
      telefono?: string;
      base?: string;
      rutaId?: string;
      adminId?: string;
      montoAsignado?: number; // solo para role === "admin": capital que el jefe asigna al nuevo admin
    };

    if (!email || !password || !role || !createdByUid) {
      return NextResponse.json(
        { error: "Faltan email, password, role o createdByUid" },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminFirestore();

    let creatorRole: Role | null = null;
    let empresaId: string;
    /** Datos del creador cuando no es superAdmin (jefe o admin), para reutilizar codigo al crear admin */
    let creatorData: Record<string, unknown> | null = null;

    const superDoc = await adminDb.collection(SUPER_ADMIN_COLLECTION).doc(createdByUid).get();
    if (superDoc.exists) {
      creatorRole = "superAdmin";
      empresaId = "";
    } else {
      const userDoc = await adminDb.collection(USERS_COLLECTION).doc(createdByUid).get();
      if (!userDoc.exists) {
        return NextResponse.json({ error: "Usuario creador no encontrado" }, { status: 403 });
      }
      creatorData = userDoc.data()!;
      creatorRole = (creatorData.role === "empleado" ? "trabajador" : creatorData.role) as Role;
      empresaId = (creatorData.empresaId as string) ?? "";
    }

    if (!creatorRole) {
      return NextResponse.json({ error: "Usuario creador no encontrado" }, { status: 403 });
    }
    if (!canCreateRole(creatorRole, role)) {
      return NextResponse.json(
        { error: `No tienes permiso para crear usuarios con rol ${role}` },
        { status: 403 }
      );
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || undefined,
    });
    const uid = userRecord.uid;

    const rolFirestore = toRolFirestore(role);
    const now = new Date();

    // Código secuencial para jefe (JF-001, JF-002, ...)
    let codigoJefe: string | null = null;
    if (role === "jefe") {
      const counterRef = adminDb.collection(COUNTERS_COLLECTION).doc(JEFES_COUNTER_ID);
      const nextNum = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const lastNum = snap.exists ? (snap.data()?.lastNum ?? 0) : 0;
        const next = lastNum + 1;
        tx.set(counterRef, { lastNum: next }, { merge: true });
        return next;
      });
      codigoJefe = `JF-${String(nextNum).padStart(3, "0")}`;
    }

    // Código secuencial para admin (AD-001, AD-002, ...) por jefe + código del jefe creador + adminNum para rutas RT-XXX-YYY
    let codigoAdmin: string | null = null;
    let jefeCodigo: string | null = null;
    let adminNum: number | null = null;
    if (role === "admin") {
      const jefeUid = createdByUid;
      const counterRef = adminDb.collection(COUNTERS_COLLECTION).doc(getAdminsCounterId(jefeUid));
      const nextNum = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const lastNum = snap.exists ? (snap.data()?.lastNum ?? 0) : 0;
        const next = lastNum + 1;
        tx.set(counterRef, { lastNum: next }, { merge: true });
        return next;
      });
      adminNum = nextNum;
      codigoAdmin = `AD-${String(nextNum).padStart(3, "0")}`;
      if (creatorData?.codigo) jefeCodigo = creatorData.codigo as string;
    }

    // Determinar empresaId
    if (role === "jefe") {
      empresaId = uid; // El jefe es dueño, empresaId = su uid
      // Crear documento de empresa
      await adminDb.collection(EMPRESAS_COLLECTION).doc(empresaId).set(
        {
          nombre: "",
          logo: "",
          dueño: displayName ?? "",
          sedePrincipal: "",
          fechaCreacion: now,
          activa: true,
          dueñoUid: uid,
        },
        { merge: true }
      );
    } else if (role === "admin") {
      empresaId = createdByUid; // El jefe crea admin, empresaId = jefeUid
    } else {
      // empleado: empresaId viene del admin creador
      const creatorDoc = await adminDb.collection(USERS_COLLECTION).doc(createdByUid).get();
      empresaId = creatorDoc.data()?.empresaId ?? "";
      if (!empresaId) {
        return NextResponse.json({ error: "No se pudo determinar la empresa del administrador" }, { status: 400 });
      }
    }

    // Escribir en empresas/{empresaId}/usuarios/{uid}
    const usuarioEmpresaData: Record<string, unknown> = {
      nombre: displayName ?? "",
      email,
      rol: rolFirestore,
      activo: true,
      creadoPor: createdByUid,
      fechaCreacion: now,
    };
    if (cedula !== undefined) usuarioEmpresaData.cedula = cedula;
    if (lugar !== undefined) usuarioEmpresaData.lugar = lugar;
    if (direccion !== undefined) usuarioEmpresaData.direccion = direccion;
    if (telefono !== undefined) usuarioEmpresaData.telefono = telefono;
    if (base !== undefined) usuarioEmpresaData.base = base;
    if (rolFirestore === "empleado" && rutaId) usuarioEmpresaData.rutaId = rutaId;
    if (rolFirestore === "empleado") {
      const empleadoAdminId = adminId || (creatorRole === "admin" ? createdByUid : undefined);
      if (empleadoAdminId) usuarioEmpresaData.adminId = empleadoAdminId;
    }
    if (codigoJefe) usuarioEmpresaData.codigo = codigoJefe;
    if (codigoAdmin) usuarioEmpresaData.codigo = codigoAdmin;
    if (jefeCodigo) usuarioEmpresaData.jefeCodigo = jefeCodigo;
    if (adminNum !== null) usuarioEmpresaData.adminNum = adminNum;

    const montoDesdeBase = parseMontoBase(base);
    const montoParaAdmin =
      typeof montoAsignado === "number" && montoAsignado > 0
        ? montoAsignado
        : montoDesdeBase ?? 0;

    if (role === "admin" && montoParaAdmin > 0) {
      if (creatorRole !== "jefe") {
        return NextResponse.json(
          { error: "Solo el jefe puede asignar capital al crear un administrador" },
          { status: 400 }
        );
      }
      try {
        await asignarCapitalAAdmin(adminDb, createdByUid, montoParaAdmin);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Error al asignar capital al administrador" },
          { status: 400 }
        );
      }
      usuarioEmpresaData.cajaAdmin = montoParaAdmin;
      usuarioEmpresaData.ultimaActualizacionCapital = now;
    } else if (role === "admin") {
      usuarioEmpresaData.cajaAdmin = 0;
    }
    if (rolFirestore === "empleado") {
      if (montoDesdeBase && montoDesdeBase > 0) {
        usuarioEmpresaData.cajaEmpleado = montoDesdeBase;
        usuarioEmpresaData.ultimaActualizacionCapital = now;
      } else {
        usuarioEmpresaData.cajaEmpleado = 0;
      }
    }

    await adminDb
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(uid)
      .set(usuarioEmpresaData);

    if (
      rolFirestore === "empleado" &&
      rutaId &&
      montoDesdeBase &&
      montoDesdeBase > 0
    ) {
      const rutaRef = adminDb
        .collection(EMPRESAS_COLLECTION)
        .doc(empresaId)
        .collection(RUTAS_SUBCOLLECTION)
        .doc(rutaId);
      const rutaSnap = await rutaRef.get();
      if (rutaSnap.exists) {
        const rd = rutaSnap.data() as Record<string, unknown>;
        const cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
        const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
        const ganancias = typeof rd.ganancias === "number" ? rd.ganancias : 0;
        const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;
        const oldCajas =
          typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
        const cajasEmpleados = oldCajas + montoDesdeBase;
        const prevCapital =
          typeof rd.capitalTotal === "number"
            ? rd.capitalTotal
            : cajaRuta + oldCajas + inversiones + ganancias - perdidas;
        const capitalTotal = prevCapital + montoDesdeBase;
        const merged = { ...rd, cajasEmpleados, capitalTotal, ultimaActualizacion: now };
        await rutaRef.set(
          { cajasEmpleados, capitalTotal, ultimaActualizacion: now },
          { merge: true }
        );
        await upsertCapitalRutaSnapshot(adminDb, empresaId, rutaId, merged);
      }
    }

    if (role === "admin" && montoParaAdmin > 0) {
      await persistAggregatedCapitalDocs(adminDb, empresaId);
    }
    if (
      rolFirestore === "empleado" &&
      montoDesdeBase &&
      montoDesdeBase > 0
    ) {
      await persistAggregatedCapitalDocs(adminDb, empresaId);
    }

    // Índice de auth en /users/{uid}
    const userAuthData: Record<string, unknown> = {
      empresaId,
      role: rolFirestore,
      email,
      displayName: displayName || null,
      enabled: true,
      createdBy: createdByUid,
      createdAt: now,
      updatedAt: now,
    };
    if (cedula !== undefined) userAuthData.cedula = cedula;
    if (lugar !== undefined) userAuthData.lugar = lugar;
    if (direccion !== undefined) userAuthData.direccion = direccion;
    if (telefono !== undefined) userAuthData.telefono = telefono;
    if (base !== undefined) userAuthData.base = base;
    if (rolFirestore === "empleado" && rutaId) userAuthData.rutaId = rutaId;
    if (rolFirestore === "empleado") {
      const empleadoAdminId = adminId || (creatorRole === "admin" ? createdByUid : undefined);
      if (empleadoAdminId) userAuthData.adminId = empleadoAdminId;
    }
    if (codigoJefe) userAuthData.codigo = codigoJefe;
    if (codigoAdmin) userAuthData.codigo = codigoAdmin;
    if (jefeCodigo) userAuthData.jefeCodigo = jefeCodigo;
    if (adminNum !== null) userAuthData.adminNum = adminNum;

    await adminDb.collection(USERS_COLLECTION).doc(uid).set(userAuthData);

    return NextResponse.json({ uid });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al crear usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
