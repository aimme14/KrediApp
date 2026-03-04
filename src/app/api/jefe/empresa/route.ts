import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { EmpresaProfile } from "@/types/empresa";
import { EMPRESAS_COLLECTION, USERS_COLLECTION } from "@/lib/empresas-db";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { jefeUid, nombre, logo, dueño, sedePrincipal } = body as {
      jefeUid: string;
      nombre?: string;
      logo?: string;
      dueño?: string;
      sedePrincipal?: string;
    };

    if (!jefeUid) {
      return NextResponse.json({ error: "Falta jefeUid" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const jefeRef = db.collection(USERS_COLLECTION).doc(jefeUid);
    const jefeSnap = await jefeRef.get();
    if (!jefeSnap.exists || jefeSnap.data()?.role !== "jefe") {
      return NextResponse.json(
        { error: "Solo un jefe puede guardar el perfil de su empresa" },
        { status: 403 }
      );
    }

    const data: EmpresaProfile = {
      nombre: nombre ?? "",
      logo: logo ?? "",
      dueño: dueño ?? "",
      sedePrincipal: sedePrincipal ?? "",
    };

    const empRef = db.collection(EMPRESAS_COLLECTION).doc(jefeUid);
    await empRef.set(
      {
        ...data,
        dueñoUid: jefeUid,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al guardar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
