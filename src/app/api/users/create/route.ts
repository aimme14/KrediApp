import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { canCreateRole } from "@/types/roles";
import type { Role } from "@/types/roles";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";
import {
  EMPRESAS_COLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";

/** Mapea Role de la app a rol en Firestore (empleado vs trabajador) */
function toRolFirestore(role: Role): "jefe" | "admin" | "empleado" {
  if (role === "trabajador") return "empleado";
  if (role === "jefe" || role === "admin") return role;
  return "empleado";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, displayName, role, createdByUid, cedula, lugar, base, adminId } = body as {
      email: string;
      password: string;
      displayName?: string;
      role: Role;
      createdByUid: string;
      cedula?: string;
      lugar?: string;
      base?: string;
      adminId?: string; // para empleados: admin asignado
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

    const superDoc = await adminDb.collection(SUPER_ADMIN_COLLECTION).doc(createdByUid).get();
    if (superDoc.exists) {
      creatorRole = "superAdmin";
      // SuperAdmin crea jefe -> empresaId = uid del nuevo jefe (se asigna después)
      empresaId = ""; // se asignará al crear
    } else {
      const userDoc = await adminDb.collection(USERS_COLLECTION).doc(createdByUid).get();
      if (!userDoc.exists) {
        return NextResponse.json({ error: "Usuario creador no encontrado" }, { status: 403 });
      }
      const creatorData = userDoc.data()!;
      creatorRole = (creatorData.role === "empleado" ? "trabajador" : creatorData.role) as Role;
      empresaId = creatorData.empresaId ?? "";
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
    if (base !== undefined) usuarioEmpresaData.base = base;
    if (rolFirestore === "empleado" && adminId) usuarioEmpresaData.adminId = adminId;

    await adminDb
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(uid)
      .set(usuarioEmpresaData);

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
    if (base !== undefined) userAuthData.base = base;
    if (rolFirestore === "empleado" && adminId) userAuthData.adminId = adminId;

    await adminDb.collection(USERS_COLLECTION).doc(uid).set(userAuthData);

    return NextResponse.json({ uid });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al crear usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
