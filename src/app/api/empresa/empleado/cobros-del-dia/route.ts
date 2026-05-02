import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getApiUser } from "@/lib/api-auth";
import { buildCierreDiaSnapshot } from "@/lib/cierre-dia-snapshot";
import { fechaDiaColombiaHoy, parseFechaDiaColombia } from "@/lib/colombia-day-bounds";

export type CobroDiaItemApi = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  metodoPago: string | null;
  fecha: string | null;
  totalAPagar: number;
  saldoPendienteTrasPago: number;
  saldoPendientePrestamoActual: number;
  cuotasFaltantes: number;
  numeroCuotas: number;
};

/** Visitas sin cobro registradas ese día por este trabajador (`tipo: no_pago`). */
export type NoPagoDiaItemApi = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  fecha: string | null;
  motivoNoPago: string;
  nota: string | null;
  saldoPendientePrestamoActual: number;
};

/** GET: cobros del día, «no pagó», totales y base asignada. ?fecha=YYYY-MM-DD (Colombia). */
export async function GET(request: NextRequest) {
  const apiUser = await getApiUser(request);
  if (!apiUser) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (apiUser.role !== "empleado") {
    return NextResponse.json({ error: "Solo trabajadores" }, { status: 403 });
  }
  if (!apiUser.rutaId?.trim()) {
    return NextResponse.json({ error: "No tienes ruta asignada" }, { status: 400 });
  }

  const fechaParam = request.nextUrl.searchParams.get("fecha");
  const fechaDia =
    fechaParam && parseFechaDiaColombia(fechaParam).ok ? fechaParam : fechaDiaColombiaHoy();

  const db = getAdminFirestore();
  const empresaId = apiUser.empresaId;
  const rutaId = apiUser.rutaId.trim();

  try {
    const snap = await buildCierreDiaSnapshot(db, {
      empresaId,
      empleadoUid: apiUser.uid,
      rutaId,
      fechaDia,
    });

    return NextResponse.json({
      fechaDia: snap.fechaDia,
      rutaId: snap.rutaId,
      cobros: snap.cobros,
      noPagos: snap.noPagos,
      totalCobrosLista: snap.totalCobrosLista,
      tuCajaDelDia: snap.tuCajaDelDia,
      totalCobrosAcreditanTuCaja: snap.totalCobrosAcreditanTuCaja,
      totalGastosDia: snap.totalGastosDia,
      gastosDelDia: snap.gastosDelDia,
      totalBaseAsignadaDia: snap.totalBaseAsignadaDia,
      prestamosDesembolsoDelDia: snap.prestamosDesembolsoDelDia,
      totalPrestamosDesembolsoDia: snap.totalPrestamosDesembolsoDia,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar cobros del día";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
