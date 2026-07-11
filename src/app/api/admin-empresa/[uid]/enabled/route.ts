import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { setEmpresaAccesoCompleto } from "@/lib/empresa-acceso";
import { assertSuperAdmin } from "@/lib/super-admin-auth";
import { USERS_COLLECTION } from "@/lib/empresas-db";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid: adminEmpresaUid } = await params;
    const body = await _request.json();
    const { enabled, superAdminUid } = body as { enabled: boolean; superAdminUid: string };

    if (typeof enabled !== "boolean" || !superAdminUid) {
      return NextResponse.json(
        { error: "Faltan enabled o superAdminUid" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const auth = await assertSuperAdmin(db, superAdminUid);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const userRef = db.collection(USERS_COLLECTION).doc(adminEmpresaUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists || userSnap.data()?.role !== "adminEmpresa") {
      return NextResponse.json(
        { error: "El usuario no es un administrador de empresa" },
        { status: 403 }
      );
    }

    const { uidsActualizados } = await setEmpresaAccesoCompleto(db, adminEmpresaUid, enabled);

    return NextResponse.json({ ok: true, uidsActualizados });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
