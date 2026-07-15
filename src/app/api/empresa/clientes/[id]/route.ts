import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentReference, type DocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  CLIENTES_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { syncMorosoEnPrestamosCliente } from "@/lib/sync-prestamo-moroso";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";

type ClienteRef = DocumentReference;
type ClienteSnap = DocumentSnapshot;

async function getClienteAutorizado(
  apiUser: NonNullable<Awaited<ReturnType<typeof getApiUser>>>,
  clienteId: string
): Promise<{ ref: ClienteRef; snap: ClienteSnap } | NextResponse> {
  const db = getAdminFirestore();
  const ref = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(CLIENTES_SUBCOLLECTION)
    .doc(clienteId);

  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }
  if (snap.data()?.adminId !== apiUser.uid) {
    return NextResponse.json({ error: "No puedes modificar este cliente" }, { status: 403 });
  }

  return { ref, snap };
}

/** PATCH: moroso (boolean) o actualización de datos de contacto (solo admin) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id: clienteId } = await params;
  const body = await request.json();
  const { moroso, nombre, ubicacion, direccion, telefono, cedula } = body as {
    moroso?: boolean;
    nombre?: string;
    ubicacion?: string;
    direccion?: string;
    telefono?: string;
    cedula?: string;
  };

  const cliente = await getClienteAutorizado(apiUser, clienteId);
  if (cliente instanceof NextResponse) return cliente;
  const { ref, snap } = cliente;

  if (typeof moroso === "boolean") {
    const db = getAdminFirestore();
    const eraMoroso = snap.data()?.moroso === true;

    await Promise.all([
      ref.update({ moroso }),
      syncMorosoEnPrestamosCliente(db, apiUser.empresaId, clienteId, moroso),
      eraMoroso !== moroso
        ? db
            .collection(EMPRESAS_COLLECTION)
            .doc(apiUser.empresaId)
            .collection(USUARIOS_SUBCOLLECTION)
            .doc(apiUser.uid)
            .set(
              { totalMorosos: FieldValue.increment(moroso ? 1 : -1) },
              { merge: true }
            )
        : Promise.resolve(),
    ]);

    return NextResponse.json({ ok: true });
  }

  const tieneDatos =
    nombre !== undefined ||
    ubicacion !== undefined ||
    direccion !== undefined ||
    telefono !== undefined ||
    cedula !== undefined;

  if (!tieneDatos) {
    return NextResponse.json(
      { error: "Se requiere moroso (boolean) o datos del cliente para actualizar" },
      { status: 400 }
    );
  }

  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json(
      { error: "Solo el administrador puede actualizar los datos del cliente" },
      { status: 403 }
    );
  }

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  await ref.update({
    nombre: nombre.trim(),
    ubicacion: typeof ubicacion === "string" ? ubicacion.trim() : "",
    direccion: typeof direccion === "string" ? direccion.trim() : "",
    telefono: typeof telefono === "string" ? telefono.trim() : "",
    cedula: typeof cedula === "string" ? cedula.trim() : "",
  });

  return NextResponse.json({ ok: true });
}

/** DELETE: elimina el cliente solo si no tiene préstamo activo. Decrementa totalClientes. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(_request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json(
      { error: "Solo el administrador puede eliminar clientes" },
      { status: 403 }
    );
  }

  const { id: clienteId } = await params;
  const cliente = await getClienteAutorizado(apiUser, clienteId);
  if (cliente instanceof NextResponse) return cliente;
  const { ref, snap } = cliente;
  const data = snap.data()!;

  if (data.prestamo_activo === true) {
    return NextResponse.json(
      { error: "No se puede eliminar un cliente con préstamo activo" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const adminId =
    typeof data.adminId === "string" && data.adminId.trim()
      ? data.adminId.trim()
      : apiUser.uid;
  const eraMoroso = data.moroso === true;

  await ref.delete();

  const usuarioRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(apiUser.empresaId)
    .collection(USUARIOS_SUBCOLLECTION)
    .doc(adminId);

  const updates: Record<string, ReturnType<typeof FieldValue.increment>> = {
    totalClientes: FieldValue.increment(-1),
  };
  if (eraMoroso) {
    updates.totalMorosos = FieldValue.increment(-1);
  }
  await usuarioRef.set(updates, { merge: true });

  return NextResponse.json({ ok: true });
}
