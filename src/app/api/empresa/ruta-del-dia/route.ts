import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
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

/** GET: datos para la sección «ruta del día» (admin): bases de ruta y de cada trabajador asignado. */
export async function GET(_request: NextRequest) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;

  const rutasSnap = await db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(RUTAS_SUBCOLLECTION)
    .where("adminId", "==", apiUser.uid)
    .get();

  const rutas = await Promise.all(
    rutasSnap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const cajaRuta = typeof data.cajaRuta === "number" ? data.cajaRuta : 0;
      const desdeDocRuta = idsEmpleadosRuta(data);
      const desdeUsuarios = await uidsEmpleadosPorRutaEnUsuarios(db, empresaId, d.id);
      const empleadoUids = Array.from(new Set([...desdeDocRuta, ...desdeUsuarios]));

      const empleados = await Promise.all(
        empleadoUids.map(async (uid) => {
          const uSnap = await db
            .collection(EMPRESAS_COLLECTION)
            .doc(empresaId)
            .collection(USUARIOS_SUBCOLLECTION)
            .doc(uid)
            .get();
          const ud = uSnap.data() as Record<string, unknown> | undefined;
          const baseTrabajador = round2(
            ud && typeof ud.cajaEmpleado === "number" ? ud.cajaEmpleado : 0
          );

          const authSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
          const nombre =
            (authSnap.data()?.displayName as string | undefined)?.trim() ||
            "Sin nombre";

          return {
            uid,
            nombre,
            baseTrabajador,
          };
        })
      );

      return {
        id: d.id,
        nombre: (data.nombre as string) ?? "",
        codigo: typeof data.codigo === "string" ? data.codigo : undefined,
        ubicacion: (data.ubicacion as string) ?? "",
        cajaRuta: round2(cajaRuta),
        empleados,
      };
    })
  );

  rutas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return NextResponse.json({ rutas });
}
