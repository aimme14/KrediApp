import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { canCreateRole } from "@/types/roles";
import type { Role } from "@/types/roles";

const USERS_COLLECTION = "users";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, displayName, role, createdByUid } = body as {
      email: string;
      password: string;
      displayName?: string;
      role: Role;
      createdByUid: string;
    };

    if (!email || !password || !role || !createdByUid) {
      return NextResponse.json(
        { error: "Faltan email, password, role o createdByUid" },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminFirestore();

    const creatorDoc = await adminDb.collection(USERS_COLLECTION).doc(createdByUid).get();
    if (!creatorDoc.exists) {
      return NextResponse.json({ error: "Usuario creador no encontrado" }, { status: 403 });
    }
    const creatorRole = creatorDoc.data()?.role as Role;
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

    await adminDb.collection(USERS_COLLECTION).doc(uid).set({
      uid,
      email,
      displayName: displayName || null,
      role,
      enabled: true,
      createdBy: createdByUid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ uid });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al crear usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
