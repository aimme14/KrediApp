import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import {
  EMPRESAS_COLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  USERS_COLLECTION,
} from "@/lib/empresas-db";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function idsEmpleadosRuta(data: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const legacy = typeof data.empleadoId === "string" ? data.empleadoId.trim() : "";
  if (legacy) out.add(legacy);
  const ids = data.empleadosIds;
  if (Array.isArray(ids)) {
    for (const x of ids) {
      if (typeof x === "string" && x.trim()) out.add(x.trim());
    }
  }
  return Array.from(out);
}

/** Trabajadores con `usuarios/{uid}.rutaId === rutaDocId` (alta desde Empleado sin tocar empleadosIds en la ruta). */
async function uidsEmpleadosPorRutaEnUsuarios(
  db: Firestore,
  empresaId: string,
  rutaDocId: string
): Promise<string[]> {
  const snap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .where("rutaId", "==", rutaDocId)
    .get();
  const out: string[] = [];
  for (const doc of snap.docs) {
    const rol = doc.data()?.rol;
    if (rol === "empleado") out.push(doc.id);
  }
  return out;
}

/** GET: datos para «ruta del día» (admin): caja de la ruta y trabajadores asignados (sin leer saldo del trabajador). */
export async function GET(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);

  const rutasSnap = await empresaRef
    .collection(RUTAS_SUBCOLLECTION)
    .where("adminId", "==", apiUser.uid)
    .get();

  /** Queries por ruta acotadas, en paralelo (evita leer todos los empleados de la empresa). */
  const porRuta = await Promise.all(
    rutasSnap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const desdeDocRuta = idsEmpleadosRuta(data);
      const desdeUsuarios = await uidsEmpleadosPorRutaEnUsuarios(db, empresaId, d.id);
      const empleadoUids = Array.from(new Set([...desdeDocRuta, ...desdeUsuarios]));
      return { id: d.id, data, empleadoUids };
    })
  );

  const todosLosUids = new Set<string>();
  for (const row of porRuta) {
    row.empleadoUids.forEach((uid) => todosLosUids.add(uid));
  }

  const perfiles = new Map<string, string>();
  await Promise.all(
    Array.from(todosLosUids).map(async (uid) => {
      const authSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
      const nombre =
        (authSnap.data()?.displayName as string | undefined)?.trim() || "Sin nombre";
      perfiles.set(uid, nombre);
    })
  );

  const rutas = porRuta.map(({ id, data, empleadoUids }) => {
    const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
    const empleados = empleadoUids.map((uid) => ({
      uid,
      nombre: perfiles.get(uid) ?? "Sin nombre",
    }));

    return {
      id,
      nombre: (data.nombre as string) ?? "",
      codigo: typeof data.codigo === "string" ? data.codigo : undefined,
      ubicacion: (data.ubicacion as string) ?? "",
      cajaRuta: round2(cajaRuta),
      empleados,
    };
  });

  rutas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return NextResponse.json({ rutas });
}
