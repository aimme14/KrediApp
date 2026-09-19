/**
 * TEMPORAL — anula cobro(s) activos y elimina el préstamo.
 * Omite restricciones de periodo abierto y reporte aprobado.
 * Devuelve el desembolso a la caja de origen (`desembolsoDesde`).
 *
 * Uso:
 *   npx tsx src/scripts/anular-cobro-eliminar-prestamo-TEMP.ts --dry-run --prestamo=OhJlwg9OmpiHtCHAaE31
 *   $env:CONFIRM="1"; npx tsx src/scripts/anular-cobro-eliminar-prestamo-TEMP.ts --prestamo=OhJlwg9OmpiHtCHAaE31
 */

import path from "path";
import dotenv from "dotenv";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

for (const p of [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")]) {
  dotenv.config({ path: p });
}

import {
  EMPRESAS_COLLECTION,
  PRESTAMOS_SUBCOLLECTION,
  PAGOS_SUBCOLLECTION,
  RUTAS_SUBCOLLECTION,
  USUARIOS_SUBCOLLECTION,
  CLIENTES_SUBCOLLECTION,
} from "@/lib/empresas-db";
import {
  calcularReversion,
  determinarModoReversion,
  inferirAcreditaCajaRuta,
  type DatosEmpleado,
  type DatosPago,
  type DatosPrestamo,
  type DatosRuta,
} from "@/lib/anular-pago-prestamo";
import { upsertCapitalRutaSnapshot } from "@/lib/capital-ruta-snapshot";
import { computeCapitalTotalRutaDesdeSaldos } from "@/lib/capital-formulas";
import { round2 } from "@/lib/ruta-financiera-compute";
import { deltaTotalPrestamosActivosAlEliminar } from "@/lib/total-prestamos-activos";

const DEFAULT_PRESTAMO_ID = "OhJlwg9OmpiHtCHAaE31";

function arg(name: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : "";
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fechaDesdeFirestore(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

function mapDatosPago(pd: Record<string, unknown>): DatosPago {
  return {
    estado: typeof pd.estado === "string" ? pd.estado : "activo",
    tipo: typeof pd.tipo === "string" ? pd.tipo : "pago",
    monto: typeof pd.monto === "number" ? pd.monto : 0,
    cuotaCapital: typeof pd.cuotaCapital === "number" ? pd.cuotaCapital : 0,
    cuotaGanancia: typeof pd.cuotaGanancia === "number" ? pd.cuotaGanancia : 0,
    inversionesDescontadas:
      typeof pd.inversionesDescontadas === "number" ? pd.inversionesDescontadas : undefined,
    gananciaAplicada:
      typeof pd.gananciaAplicada === "number" ? pd.gananciaAplicada : undefined,
    acreditaCajaRuta: inferirAcreditaCajaRuta(pd),
    tieneSnapshotsCompletos: pd.tieneSnapshotsCompletos === true,
    saldoPendienteAntes:
      typeof pd.saldoPendienteAntes === "number" ? pd.saldoPendienteAntes : undefined,
    saldoPendienteDespues:
      typeof pd.saldoPendienteDespues === "number" ? pd.saldoPendienteDespues : undefined,
    adelantoCuotaAntes:
      typeof pd.adelantoCuotaAntes === "number" ? pd.adelantoCuotaAntes : undefined,
    adelantoCuotaDespues:
      typeof pd.adelantoCuotaDespues === "number" ? pd.adelantoCuotaDespues : undefined,
    estadoPrestamoAntes:
      typeof pd.estadoPrestamoAntes === "string" ? pd.estadoPrestamoAntes : undefined,
    estadoPrestamoDespues:
      typeof pd.estadoPrestamoDespues === "string" ? pd.estadoPrestamoDespues : undefined,
    fecha: fechaDesdeFirestore(pd.fecha),
    empleadoId: typeof pd.empleadoId === "string" ? pd.empleadoId : "",
    intentosFallidosAntes:
      typeof pd.intentosFallidosAntes === "number" ? pd.intentosFallidosAntes : 0,
    ultimoPagoIdAnterior:
      typeof pd.ultimoPagoIdAnterior === "string" ? pd.ultimoPagoIdAnterior : null,
  };
}

type PrestamoTarget = {
  empresaId: string;
  prestamoId: string;
  prestamoRef: FirebaseFirestore.DocumentReference;
  pr: Record<string, unknown>;
};

async function findPrestamo(db: Firestore, prestamoId: string, empresaFilter: string): Promise<PrestamoTarget> {
  if (empresaFilter) {
    const ref = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaFilter)
      .collection(PRESTAMOS_SUBCOLLECTION)
      .doc(prestamoId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Préstamo ${prestamoId} no encontrado en empresa ${empresaFilter}`);
    return { empresaId: empresaFilter, prestamoId, prestamoRef: ref, pr: snap.data()! };
  }

  const empresas = await db.collection(EMPRESAS_COLLECTION).get();
  const matches: PrestamoTarget[] = [];
  for (const e of empresas.docs) {
    const ref = e.ref.collection(PRESTAMOS_SUBCOLLECTION).doc(prestamoId);
    const snap = await ref.get();
    if (snap.exists) {
      matches.push({ empresaId: e.id, prestamoId, prestamoRef: ref, pr: snap.data()! });
    }
  }
  if (matches.length === 0) throw new Error(`Préstamo ${prestamoId} no encontrado`);
  if (matches.length > 1) {
    throw new Error(`Préstamo ${prestamoId} en ${matches.length} empresas; usa --empresa=<id>`);
  }
  return matches[0]!;
}

async function loadPagosActivos(prestamoRef: FirebaseFirestore.DocumentReference) {
  const snap = await prestamoRef.collection(PAGOS_SUBCOLLECTION).orderBy("fecha", "desc").get();
  return snap.docs
    .filter((d) => {
      const data = d.data();
      return (data.estado ?? "activo") !== "anulado" && data.tipo === "pago";
    })
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

function readRuta(pr: Record<string, unknown>, rd: Record<string, unknown>): DatosRuta {
  return {
    cajaRuta: typeof rd.cajaRuta === "number" ? rd.cajaRuta : 0,
    cajasEmpleados: typeof rd.cajasEmpleados === "number" ? rd.cajasEmpleados : 0,
    inversiones: typeof rd.inversiones === "number" ? rd.inversiones : 0,
    ganancias: typeof rd.ganancias === "number" ? rd.ganancias : 0,
    perdidas: typeof rd.perdidas === "number" ? rd.perdidas : 0,
  };
}

async function preview(db: Firestore, target: PrestamoTarget) {
  const { pr, prestamoRef, empresaId } = target;
  const rutaId = typeof pr.rutaId === "string" ? pr.rutaId.trim() : "";
  const empleadoId = typeof pr.empleadoId === "string" ? pr.empleadoId.trim() : "";
  const monto = typeof pr.monto === "number" ? pr.monto : 0;
  const desembolsoDesde =
    typeof pr.desembolsoDesde === "string" ? pr.desembolsoDesde : "caja_ruta";

  const pagos = await loadPagosActivos(prestamoRef);

  let ruta: DatosRuta = { cajaRuta: 0, cajasEmpleados: 0, inversiones: 0, ganancias: 0, perdidas: 0 };
  let cajaEmpleado = 0;
  let empleadoNombre = "";

  if (rutaId) {
    const rutaSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(RUTAS_SUBCOLLECTION)
      .doc(rutaId)
      .get();
    if (rutaSnap.exists) ruta = readRuta(pr, rutaSnap.data()!);
  }

  if (empleadoId) {
    const empSnap = await db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(USUARIOS_SUBCOLLECTION)
      .doc(empleadoId)
      .get();
    if (empSnap.exists) {
      const ed = empSnap.data()!;
      cajaEmpleado = typeof ed.cajaEmpleado === "number" ? ed.cajaEmpleado : 0;
      empleadoNombre = typeof ed.nombre === "string" ? ed.nombre : empleadoId;
    }
  }

  let prestamo: DatosPrestamo = {
    saldoPendiente: (pr.saldoPendiente as number) ?? 0,
    adelantoCuota: (pr.adelantoCuota as number) ?? 0,
    estado: (pr.estado as string) ?? "activo",
    fechaCierre: pr.fechaCierre ?? null,
  };

  const reversiones: Array<{ pagoId: string; monto: number; rev: ReturnType<typeof calcularReversion> }> = [];

  for (const p of pagos) {
    const pago = mapDatosPago(p.data);
    const modo = determinarModoReversion(pago);
    const empleado: DatosEmpleado = !pago.acreditaCajaRuta
      ? { cajaEmpleado }
      : null;
    const rev = calcularReversion({ pago, prestamo, ruta, empleado, modo });
    reversiones.push({ pagoId: p.id, monto: pago.monto, rev });

    ruta = {
      cajaRuta: rev.nuevaCajaRuta,
      cajasEmpleados: rev.nuevosCajasEmpleados,
      inversiones: rev.nuevasInversiones,
      ganancias: rev.nuevasGanancias,
      perdidas: ruta.perdidas,
    };
    if (rev.nuevaCajaEmpleado !== null) cajaEmpleado = rev.nuevaCajaEmpleado;
    prestamo = {
      saldoPendiente: rev.nuevoSaldoPendiente,
      adelantoCuota: rev.nuevoAdelantoCuota,
      estado: rev.nuevoEstadoPrestamo,
      fechaCierre: rev.reabrePrestamo ? null : prestamo.fechaCierre,
    };
  }

  let rutaFinal = { ...ruta };
  let cajaEmpleadoFinal = cajaEmpleado;

  if (desembolsoDesde === "caja_empleado" && empleadoId && monto > 0) {
    cajaEmpleadoFinal = round2(cajaEmpleadoFinal + monto);
    rutaFinal = {
      ...rutaFinal,
      cajasEmpleados: round2(rutaFinal.cajasEmpleados + monto),
      inversiones: round2(rutaFinal.inversiones - monto),
    };
  } else if (monto > 0) {
    rutaFinal = {
      ...rutaFinal,
      cajaRuta: round2(rutaFinal.cajaRuta + monto),
      inversiones: round2(rutaFinal.inversiones - monto),
    };
  }

  const capitalFinal = computeCapitalTotalRutaDesdeSaldos({
    cajaRuta: rutaFinal.cajaRuta,
    cajasEmpleados: rutaFinal.cajasEmpleados,
    inversiones: rutaFinal.inversiones,
    perdidas: rutaFinal.perdidas,
  });

  return {
    pagos,
    reversiones,
    desembolsoDesde,
    monto,
    rutaId,
    empleadoId,
    empleadoNombre,
    clienteNombre: typeof pr.clienteNombre === "string" ? pr.clienteNombre : "",
    saldoActual: (pr.saldoPendiente as number) ?? 0,
    totalAPagar: (pr.totalAPagar as number) ?? 0,
    adminId: typeof pr.adminId === "string" ? pr.adminId : "",
    clienteId: typeof pr.clienteId === "string" ? pr.clienteId.trim() : "",
    rutaFinal,
    cajaEmpleadoFinal,
    capitalFinal,
  };
}

async function ejecutar(db: Firestore, target: PrestamoTarget, adminUid: string) {
  const { empresaId, prestamoId, prestamoRef, pr } = target;
  const prev = await preview(db, target);

  const result = await db.runTransaction(async (tx) => {
    const prestamoSnap = await tx.get(prestamoRef);
    if (!prestamoSnap.exists) throw new Error("PRESTAMO_NOT_FOUND");
    const prTx = prestamoSnap.data()!;

    const rutaId = typeof prTx.rutaId === "string" ? prTx.rutaId.trim() : "";
    const empleadoIdPrestamo = typeof prTx.empleadoId === "string" ? prTx.empleadoId.trim() : "";
    const monto = typeof prTx.monto === "number" ? prTx.monto : 0;
    const desembolsoDesde =
      typeof prTx.desembolsoDesde === "string" ? prTx.desembolsoDesde : "caja_ruta";
    const clienteId = typeof prTx.clienteId === "string" ? prTx.clienteId.trim() : "";
    const adminId =
      typeof prTx.adminId === "string" && prTx.adminId.trim() ? prTx.adminId.trim() : adminUid;

    const rutaRef = rutaId
      ? db.collection(EMPRESAS_COLLECTION).doc(empresaId).collection(RUTAS_SUBCOLLECTION).doc(rutaId)
      : null;
    const empleadoRef = empleadoIdPrestamo
      ? db.collection(EMPRESAS_COLLECTION).doc(empresaId).collection(USUARIOS_SUBCOLLECTION).doc(empleadoIdPrestamo)
      : null;
    const clienteRef = clienteId
      ? db.collection(EMPRESAS_COLLECTION).doc(empresaId).collection(CLIENTES_SUBCOLLECTION).doc(clienteId)
      : null;

    const pagosSnap = await tx.get(prestamoRef.collection(PAGOS_SUBCOLLECTION).orderBy("fecha", "desc"));
    const pagosActivos = pagosSnap.docs.filter(
      (d) => (d.data().estado ?? "activo") !== "anulado" && d.data().tipo === "pago"
    );

    let rutaSnap = rutaRef ? await tx.get(rutaRef) : null;
    let empleadoSnap = empleadoRef ? await tx.get(empleadoRef) : null;

    let ruta: DatosRuta = rutaSnap?.exists
      ? readRuta(prTx, rutaSnap.data()!)
      : { cajaRuta: 0, cajasEmpleados: 0, inversiones: 0, ganancias: 0, perdidas: 0 };

    let cajaEmpleado =
      empleadoSnap?.exists && typeof empleadoSnap.data()?.cajaEmpleado === "number"
        ? empleadoSnap.data()!.cajaEmpleado
        : 0;

    let prestamo: DatosPrestamo = {
      saldoPendiente: (prTx.saldoPendiente as number) ?? 0,
      adelantoCuota: (prTx.adelantoCuota as number) ?? 0,
      estado: (prTx.estado as string) ?? "activo",
      fechaCierre: prTx.fechaCierre ?? null,
    };

    const now = new Date();
    let totalCobradoRevertido = 0;

    for (const doc of pagosActivos) {
      const pd = doc.data();
      const pago = mapDatosPago(pd as Record<string, unknown>);
      const modo = determinarModoReversion(pago);
      const empleadoCobradorId = !pago.acreditaCajaRuta ? pago.empleadoId : null;
      const cobradorRef = empleadoCobradorId
        ? db.collection(EMPRESAS_COLLECTION).doc(empresaId).collection(USUARIOS_SUBCOLLECTION).doc(empleadoCobradorId)
        : null;
      let cobradorSnap = cobradorRef ? await tx.get(cobradorRef) : null;
      const empleado: DatosEmpleado =
        cobradorSnap?.exists && typeof cobradorSnap.data()?.cajaEmpleado === "number"
          ? { cajaEmpleado: cobradorSnap.data()!.cajaEmpleado }
          : !pago.acreditaCajaRuta
            ? { cajaEmpleado: 0 }
            : null;

      const rev = calcularReversion({ pago, prestamo, ruta, empleado, modo });
      totalCobradoRevertido = round2(totalCobradoRevertido + pago.monto);

      tx.update(doc.ref, {
        estado: "anulado",
        anuladoEn: now,
        anuladoPorUid: adminUid,
        motivoAnulacion: "Script TEMP — anular cobro y eliminar préstamo",
        reversionModo: modo,
        anuladoViaScriptTemp: true,
      });

      if (cobradorRef && rev.nuevaCajaEmpleado !== null) {
        tx.update(cobradorRef, {
          cajaEmpleado: rev.nuevaCajaEmpleado,
          ultimaActualizacionCapital: now,
        });
        if (empleadoCobradorId === empleadoIdPrestamo) cajaEmpleado = rev.nuevaCajaEmpleado;
      }

      ruta = {
        cajaRuta: rev.nuevaCajaRuta,
        cajasEmpleados: rev.nuevosCajasEmpleados,
        inversiones: rev.nuevasInversiones,
        ganancias: rev.nuevasGanancias,
        perdidas: ruta.perdidas,
      };
      prestamo = {
        saldoPendiente: rev.nuevoSaldoPendiente,
        adelantoCuota: rev.nuevoAdelantoCuota,
        estado: rev.nuevoEstadoPrestamo,
        fechaCierre: rev.reabrePrestamo ? null : prestamo.fechaCierre,
      };
    }

    if (rutaRef && rutaSnap?.exists && totalCobradoRevertido > 0) {
      const capitalTrasCobros = computeCapitalTotalRutaDesdeSaldos({
        cajaRuta: ruta.cajaRuta,
        cajasEmpleados: ruta.cajasEmpleados,
        inversiones: ruta.inversiones,
        perdidas: ruta.perdidas,
      });
      tx.update(rutaRef, {
        cajaRuta: ruta.cajaRuta,
        cajasEmpleados: ruta.cajasEmpleados,
        inversiones: ruta.inversiones,
        ganancias: ruta.ganancias,
        capitalTotal: capitalTrasCobros,
        cobradoAcumulado: FieldValue.increment(-totalCobradoRevertido),
        ultimaActualizacion: now,
      });
    }

    if (rutaRef && rutaSnap?.exists && monto > 0) {
      if (desembolsoDesde === "caja_empleado" && empleadoRef && empleadoSnap?.exists) {
        const nuevaCajaEmp = round2(cajaEmpleado + monto);
        const nuevasCajasEmpleados = round2(ruta.cajasEmpleados + monto);
        const nuevasInversiones = round2(ruta.inversiones - monto);
        const capitalFinal = computeCapitalTotalRutaDesdeSaldos({
          cajaRuta: ruta.cajaRuta,
          cajasEmpleados: nuevasCajasEmpleados,
          inversiones: nuevasInversiones,
          perdidas: ruta.perdidas,
        });
        tx.update(empleadoRef, {
          cajaEmpleado: nuevaCajaEmp,
          ultimaActualizacionCapital: now,
        });
        tx.update(rutaRef, {
          cajasEmpleados: nuevasCajasEmpleados,
          inversiones: nuevasInversiones,
          capitalTotal: capitalFinal,
          totalPrestado: FieldValue.increment(-monto),
          ultimaActualizacion: now,
        });
      } else {
        const nuevaCajaRuta = round2(ruta.cajaRuta + monto);
        const nuevasInversiones = round2(ruta.inversiones - monto);
        const capitalFinal = computeCapitalTotalRutaDesdeSaldos({
          cajaRuta: nuevaCajaRuta,
          cajasEmpleados: ruta.cajasEmpleados,
          inversiones: nuevasInversiones,
          perdidas: ruta.perdidas,
        });
        tx.update(rutaRef, {
          cajaRuta: nuevaCajaRuta,
          inversiones: nuevasInversiones,
          capitalTotal: capitalFinal,
          totalPrestado: FieldValue.increment(-monto),
          ultimaActualizacion: now,
        });
      }
    }

    for (const doc of pagosSnap.docs) {
      tx.delete(doc.ref);
    }

    const deltaContador = deltaTotalPrestamosActivosAlEliminar(prTx.estado);
    if (deltaContador !== 0) {
      tx.set(
        db.collection(EMPRESAS_COLLECTION).doc(empresaId).collection(USUARIOS_SUBCOLLECTION).doc(adminId),
        { totalPrestamosActivos: FieldValue.increment(deltaContador) },
        { merge: true }
      );
    }

    if (clienteRef) {
      tx.update(clienteRef, { prestamo_activo: false });
    }

    tx.delete(prestamoRef);

    return { rutaId, pagosEliminados: pagosSnap.size };
  });

  if (result.rutaId) {
    const rutaRef = db
      .collection(EMPRESAS_COLLECTION)
      .doc(empresaId)
      .collection(RUTAS_SUBCOLLECTION)
      .doc(result.rutaId);
    const rutaAfter = await rutaRef.get();
    if (rutaAfter.exists) {
      await upsertCapitalRutaSnapshot(db, empresaId, result.rutaId, rutaAfter.data()!);
    }
  }

  return result;
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const confirm = process.env.CONFIRM === "1";
  const prestamoId = arg("prestamo") || DEFAULT_PRESTAMO_ID;
  const empresaFilter = arg("empresa");

  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const db = getAdminFirestore();

  console.log(`=== Anular cobro(s) + eliminar préstamo TEMP ===`);
  console.log(`prestamoId: ${prestamoId}`);

  const target = await findPrestamo(db, prestamoId, empresaFilter);
  const prev = await preview(db, target);

  console.log("\n=== Préstamo ===");
  console.log({
    empresaId: target.empresaId,
    prestamoId: target.prestamoId,
    cliente: prev.clienteNombre,
    monto: prev.monto,
    totalAPagar: prev.totalAPagar,
    saldoActual: prev.saldoActual,
    desembolsoDesde: prev.desembolsoDesde,
    empleado: prev.empleadoNombre || prev.empleadoId || "—",
    rutaId: prev.rutaId,
  });

  console.log(`\n=== Cobros activos a anular: ${prev.pagos.length} ===`);
  for (const p of prev.pagos) {
    console.log({
      pagoId: p.id,
      monto: p.data.monto,
      metodo: p.data.metodoPago,
      fecha: mapDatosPago(p.data).fecha.toISOString(),
    });
  }

  console.log("\n=== Saldos finales previstos (tras anular + eliminar) ===");
  console.log({
    cajaRuta: prev.rutaFinal.cajaRuta,
    cajasEmpleados: prev.rutaFinal.cajasEmpleados,
    inversiones: prev.rutaFinal.inversiones,
    ganancias: prev.rutaFinal.ganancias,
    cajaEmpleado: prev.desembolsoDesde === "caja_empleado" ? prev.cajaEmpleadoFinal : "N/A",
    capitalTotal: prev.capitalFinal,
  });

  if (dryRun || !confirm) {
    console.log("\n✓ Preview completado. Para ejecutar:");
    console.log(
      `  $env:CONFIRM="1"; npx tsx src/scripts/anular-cobro-eliminar-prestamo-TEMP.ts --prestamo=${prestamoId}` +
        (empresaFilter ? ` --empresa=${empresaFilter}` : "")
    );
    return;
  }

  const adminUid = prev.adminId || "script-temp";
  console.log("\n>>> Ejecutando...");
  const result = await ejecutar(db, target, adminUid);
  console.log("\n✓ Completado:", result);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
