import type { Firestore } from "firebase-admin/firestore";
import { SUPER_ADMIN_COLLECTION } from "@/types/superAdmin";

export async function assertSuperAdmin(
  db: Firestore,
  superAdminUid: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!superAdminUid) {
    return { ok: false, status: 400, error: "Falta superAdminUid" };
  }
  const superRef = db.collection(SUPER_ADMIN_COLLECTION).doc(superAdminUid);
  const superSnap = await superRef.get();
  if (!superSnap.exists || superSnap.data()?.role !== "superAdmin") {
    return {
      ok: false,
      status: 403,
      error: "Solo el Super Administrador puede realizar esta acción",
    };
  }
  return { ok: true };
}
