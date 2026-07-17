import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
} from "@/lib/empresas-db";
import { isAdminPanelApiUser } from "@/lib/admin-panel-role";
import {
  startIdempotentOperation,
  finishIdempotentOperation,
} from "@/lib/financial-idempotency";
import { recordCreditMovement } from "@/lib/financial-ledger";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { round2 } from "@/lib/ruta-financiera-compute";
import { withRateLimit } from "@/lib/with-rate-limit";
import { financialWriteLimiterUser } from "@/lib/rate-limit";

const MENSAJE_CON_MOVIMIENTOS =
  "No se puede eliminar: el préstamo ya tiene movimientos de cobro registrados.";

/**
 * DELETE: elimina un préstamo que no tiene ningún movimiento en `pagos`
 * (ni cobro, ni no_pago, ni pérdida). Solo admin/adminEmpresa dueño del préstamo.
 *
 * Revierte el desembolso devolviendo el dinero a la BASE DE LA RUTA (cajaRuta),
 * sin importar si se desembolsó desde la caja del empleado o desde la ruta:
 *   cajaRuta   += monto
 *   inversiones -= monto
 *   totalPrestado -= monto
 *   capitalTotal se mantiene (efectivo entra, inversión sale 1:1)
 * Además libera al cliente (prestamo_activo=false) y decrementa el contador del admin.
 */
async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isAdminPanelApiUser(apiUser)) {
    return NextResponse.json(
      { error: "Solo el administrador puede eliminar préstamos." },
      { status: 403 }
    );
  }

  const { id: prestamoId } = await params;
  if (!prestamoId?.trim()) {
    return NextResponse.json({ error: "Préstamo inválido." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { idempotencyKey } = body as { idempotencyKey?: string };

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;

  const prestamoRef = db
    .collection(EMPRESAS_COLLECTION)
    .doc(empresaId)
    .collection(PRESTAMOS_SUBCOLLECTION)
    .doc(prestamoId);

  const prestamoPreSnap = await prestamoRef.get();
  if (!prestamoPreSnap.exists) {
    return NextResponse.json({ error: "Préstamo no encontrado." }, { status: 404 });
  }
  if (prestamoPreSnap.data()!.adminId !== apiUser.uid) {
    return NextResponse.json(
      { error: "No tienes permisos sobre este préstamo." },
      { status: 403 }
    );
  }

  const idem = await startIdempotentOperation({
    db,
    empresaId,
    key: idempotencyKey,
    endpoint: `prestamos:${prestamoId}:delete`,
    uid: apiUser.uid,
  });
  if (idem.replay) {
    return NextResponse.json(idem.payload, { status: idem.status });
  }

  const finalize = async (status: number, payload: Record<string, unknown>) => {
    await finishIdempotentOperation({
      db,
      empresaId,
      key: idempotencyKey,
      result: { ok: status < 400, status, payload },
    });
    return NextResponse.json(payload, { status });
  };

  const pagosPreSnap = await prestamoRef
    .collection(PAGOS_SUBCOLLECTION)
    .limit(1)
    .get();
  if (!pagosPreSnap.empty) {
    return finalize(409, { error: MENSAJE_CON_MOVIMIENTOS });
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      // ── Lecturas primero (requisito de Firestore) ──
      const prestamoSnap = await tx.get(prestamoRef);
      if (!prestamoSnap.exists) throw new Error("PRESTAMO_NOT_FOUND");
      const pr = prestamoSnap.data()!;

      // Re-check autoritativo dentro de la tx: el préstamo debe estar limpio de movimientos.
      const pagosSnap = await tx.get(
        prestamoRef.collection(PAGOS_SUBCOLLECTION).limit(1)
      );
      if (!pagosSnap.empty) throw new Error("PRESTAMO_CON_MOVIMIENTOS");

      const monto = typeof pr.monto === "number" ? pr.monto : 0;
      const rutaId = typeof pr.rutaId === "string" ? pr.rutaId.trim() : "";
      const clienteId = typeof pr.clienteId === "string" ? pr.clienteId.trim() : "";
      const adminId =
        typeof pr.adminId === "string" && pr.adminId.trim()
          ? pr.adminId.trim()
          : apiUser.uid;

      const rutaRef = rutaId
        ? db
            .collection(EMPRESAS_COLLECTION)
            .doc(empresaId)
            .collection(RUTAS_SUBCOLLECTION)
            .doc(rutaId)
        : null;
      const clienteRef = clienteId
        ? db
            .collection(EMPRESAS_COLLECTION)
            .doc(empresaId)
            .collection(CLIENTES_SUBCOLLECTION)
            .doc(clienteId)
        : null;

      const rutaSnap = rutaRef ? await tx.get(rutaRef) : null;
      const clienteSnap = clienteRef ? await tx.get(clienteRef) : null;

      const now = new Date();
      let nuevaCajaRuta: number | undefined;

      // ── Reversión del desembolso hacia la base de la ruta ──
      if (rutaRef && rutaSnap?.exists && monto > 0) {
        const rd = rutaSnap.data()!;
        const cajaRuta = typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0;
        const cajasEmpleados =
          typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0;
        const inversiones = typeof rd.inversiones === "number" ? rd.inversiones : 0;
        const perdidas = typeof rd.perdidas === "number" ? rd.perdidas : 0;

        const nuevasInversiones = round2(inversiones - monto);
        if (nuevasInversiones < -0.01) throw new Error("INVERSIONES_INSUFICIENTES");

        nuevaCajaRuta = round2(cajaRuta + monto);
        const nuevoCapitalTotal = computeCapitalTotalRutaDesdeSaldos({
          cajaRuta: nuevaCajaRuta,
          cajasEmpleados,
          inversiones: nuevasInversiones,
          perdidas,
        });

        tx.update(rutaRef, {
          cajaRuta: nuevaCajaRuta,
          inversiones: nuevasInversiones,
          totalPrestado: FieldValue.increment(-monto),
          capitalTotal: nuevoCapitalTotal,
          ultimaActualizacion: now,
        });
      }

      // ── Liberar al cliente ──
      if (clienteRef && clienteSnap?.exists) {
        tx.update(clienteRef, { prestamo_activo: false });
      }

      // ── Decrementar contador de préstamos activos del admin ──
      tx.set(
        db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(USUARIOS_SUBCOLLECTION)
          .doc(adminId),
        { totalPrestamosActivos: FieldValue.increment(-1) },
        { merge: true }
      );

      // ── Eliminar el préstamo ──
      tx.delete(prestamoRef);

      return { rutaId, clienteId, monto, nuevaCajaRuta };
    });

    // Snapshot de capital de ruta — después de la tx, no dentro.
    if (result.rutaId) {
      try {
        const rutaRef = db
          .collection(EMPRESAS_COLLECTION)
          .doc(empresaId)
          .collection(RUTAS_SUBCOLLECTION)
          .doc(result.rutaId);
        const rutaAfter = await rutaRef.get();
        if (rutaAfter.exists) {
          await upsertCapitalRutaSnapshot(db, empresaId, result.rutaId, rutaAfter.data()!);
        }
      } catch (e) {
        console.warn("[prestamos:delete] upsertCapitalRutaSnapshot post-tx:", e);
      }
    }

    // Movimiento de reversión en el ledger (crédito a la base de la ruta).
    if (result.rutaId && result.monto > 0) {
      try {
        await recordCreditMovement({
          db,
          empresaId,
          walletType: "ruta_caja",
          walletId: result.rutaId,
          amount: result.monto,
          balanceAfter: result.nuevaCajaRuta,
          eventType: "prestamo_eliminado_reversion",
          scope: "ruta",
          createdBy: apiUser.uid,
          relatedEntityType: "prestamo",
          relatedEntityId: prestamoId,
          metadata: {
            prestamoId,
            clienteId: result.clienteId,
            rutaId: result.rutaId,
          },
          operationId: `prestamo-delete:${prestamoId}`,
        });
      } catch (e) {
        console.warn("[ledger] No se pudo registrar reversión de eliminación", e);
      }
    }

    return finalize(200, { ok: true, prestamoId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PRESTAMO_NOT_FOUND") {
      return finalize(404, { error: "Préstamo no encontrado." });
    }
    if (msg === "PRESTAMO_CON_MOVIMIENTOS") {
      return finalize(409, { error: MENSAJE_CON_MOVIMIENTOS });
    }
    if (msg === "INVERSIONES_INSUFICIENTES") {
      return finalize(400, {
        error: "No se puede revertir el desembolso: inversiones insuficientes en la ruta.",
      });
    }
    console.error("[prestamos:delete] Error inesperado:", e);
    return finalize(500, { error: "Error interno al eliminar el préstamo." });
  }
}

export const DELETE = withRateLimit(financialWriteLimiterUser, deleteHandler);
