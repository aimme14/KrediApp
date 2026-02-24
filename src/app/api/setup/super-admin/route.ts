import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";

const USERS_COLLECTION = "users";

/**
 * GET: Indica si aún se puede crear el primer Super Admin (no existe ninguno).
 */
export async function GET() {
  try {
    const db = getAdminFirestore();
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where("role", "==", "superAdmin")
      .limit(1)
      .get();

    const available = snapshot.empty;
    return NextResponse.json({ available });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al comprobar estado";
    console.error("[setup/super-admin GET]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: Crea el primer usuario Super Admin (solo si aún no existe ninguno).
 * Body: { email: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    const trimmedEmail = typeof email === "string" ? email.trim() : "";
    const pass = typeof password === "string" ? password : "";

    if (!trimmedEmail || !pass) {
      return NextResponse.json(
        { error: "Faltan email o contraseña" },
        { status: 400 }
      );
    }

    if (pass.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where("role", "==", "superAdmin")
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return NextResponse.json(
        { error: "Ya existe un Super Administrador. Usa la pantalla de inicio de sesión." },
        { status: 403 }
      );
    }

    const userRecord = await auth.createUser({
      email: trimmedEmail,
      password: pass,
      emailVerified: true,
    });
    const uid = userRecord.uid;

    await db.collection(USERS_COLLECTION).doc(uid).set({
      uid,
      email: trimmedEmail,
      role: "superAdmin",
      enabled: true,
      createdBy: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      uid,
      message: "Super Administrador creado. Ya puedes iniciar sesión.",
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const message = err?.message ?? "Error al crear Super Admin";

    if (err?.code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "Ese correo ya está registrado. Usa otro o inicia sesión." },
        { status: 400 }
      );
    }
    if (err?.code === "auth/invalid-email") {
      return NextResponse.json(
        { error: "El correo no es válido." },
        { status: 400 }
      );
    }
    if (err?.code === "auth/weak-password") {
      return NextResponse.json(
        { error: "La contraseña es demasiado débil. Usa al menos 6 caracteres." },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
