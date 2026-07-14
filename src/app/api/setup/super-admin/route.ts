import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";
import { syncCustomClaimsForUid } from "@/lib/sync-custom-claims";

/**
 * SEGURIDAD: El POST requiere el header X-Setup-Secret igual a SETUP_SECRET.
 *
 * El GET no requiere secret porque solo revela si ya existe un superAdmin
 * (1 bit de información, sin riesgo de takeover). La acción sensible es el POST.
 *
 * timingSafeEqual previene timing attacks en la comparación del secret.
 *
 * Genera un secret fuerte antes de desplegar:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Agrégalo como SETUP_SECRET en .env.local y en Vercel.
 */
function assertSetupSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.SETUP_SECRET;
  if (!secret) {
    // Si no hay secret configurado, bloqueamos siempre (fail-closed).
    return NextResponse.json(
      { error: "Endpoint de setup no disponible." },
      { status: 403 }
    );
  }
  const provided = request.headers.get("x-setup-secret") ?? "";
  // Comparación en tiempo constante para evitar timing attacks.
  const secretBuf = Buffer.from(secret);
  const providedBuf = Buffer.from(provided);
  const match =
    secretBuf.length === providedBuf.length &&
    timingSafeEqual(secretBuf, providedBuf);
  if (!match) {
    return NextResponse.json(
      { error: "No autorizado." },
      { status: 403 }
    );
  }
  return null; // OK
}

/**
 * GET: Indica si aún se puede crear el primer Super Admin (no existe ninguno).
 * No requiere X-Setup-Secret — solo revela available: true/false.
 */
export async function GET(_request: NextRequest) {
  try {
    const db = getAdminFirestore();
    const snapshot = await db.collection(SUPER_ADMIN_COLLECTION).limit(1).get();

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
 *
 * La contraseña se envía a Firebase Auth únicamente; NUNCA se almacena en Firestore.
 */
export async function POST(request: NextRequest) {
  const denied = assertSetupSecret(request);
  if (denied) return denied;
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

    const snapshot = await db.collection(SUPER_ADMIN_COLLECTION).limit(1).get();

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

    const now = new Date();
    await db.collection(SUPER_ADMIN_COLLECTION).doc(uid).set({
      uid,
      email: trimmedEmail,
      role: "superAdmin",
      enabled: true,
      createdBy: "",
      createdAt: now,
      updatedAt: now,
      emailVerified: true,
    });

    await syncCustomClaimsForUid(uid);

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
