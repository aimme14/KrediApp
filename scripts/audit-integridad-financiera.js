/**
 * Auditoría de integridad financiera. SOLO LECTURA: no escribe en Firestore.
 *
 * Verifica invariantes de capital y detecta síntomas de operaciones duplicadas
 * o a medio aplicar. Pensado para correrse antes y después de un despliegue y
 * comparar ambas fotos.
 *
 * Uso:
 *   node scripts/audit-integridad-financiera.js
 *   node scripts/audit-integridad-financiera.js --empresa=<empresaId>
 *   node scripts/audit-integridad-financiera.js --out=audit-pre-deploy.json
 *
 * Requiere serviceAccountKey.json en la raíz del proyecto.
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const EMPRESAS_COLLECTION = "empresas";
const USUARIOS_SUBCOLLECTION = "usuarios";
const RUTAS_SUBCOLLECTION = "rutas";
const PRESTAMOS_SUBCOLLECTION = "prestamos";
const SOLICITUDES_PRESTAMO_SUBCOLLECTION = "solicitudesPrestamo";
const SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION = "solicitudesEntregaReporte";
const FINANCIAL_OPERATIONS_SUBCOLLECTION = "financialOperations";
const CAPITAL_SUBCOLLECTION = "capital";
const CAPITAL_CAJA_EMPRESA_DOC = "cajaEmpresa";

/** Diferencias por debajo de este umbral son ruido de redondeo, no descuadres. */
const TOLERANCIA_COP = 0.02;
/** Una operación idempotente en `processing` más vieja que esto quedó colgada. */
const PROCESSING_STALE_MS = 10 * 60 * 1000;

const args = process.argv.slice(2);
const empresaArg = args.find((a) => a.startsWith("--empresa="));
const empresaFilter = empresaArg ? empresaArg.slice("--empresa=".length).trim() : "";
const outArg = args.find((a) => a.startsWith("--out="));
const outPath = outArg ? outArg.slice("--out=".length).trim() : "";

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return 0;
}

/** Un hallazgo = una violación concreta de invariante, con su evidencia. */
function hallazgo(severidad, tipo, detalle) {
  return { severidad, tipo, ...detalle };
}

async function auditarEmpresa(empresaId) {
  const empresaRef = db.collection(EMPRESAS_COLLECTION).doc(empresaId);
  const hallazgos = [];

  const [rutasSnap, usuariosSnap, prestamosSnap] = await Promise.all([
    empresaRef.collection(RUTAS_SUBCOLLECTION).get(),
    empresaRef.collection(USUARIOS_SUBCOLLECTION).get(),
    empresaRef.collection(PRESTAMOS_SUBCOLLECTION).get(),
  ]);

  /** Saldos por wallet, para poder comparar dos ejecuciones campo a campo. */
  const saldos = { rutas: {}, usuarios: {}, cajaEmpresa: 0 };

  const cajaEmpleadoPorRuta = new Map();
  for (const uDoc of usuariosSnap.docs) {
    const u = uDoc.data();
    const rutaId = typeof u.rutaId === "string" ? u.rutaId.trim() : "";
    const cajaEmpleado = num(u.cajaEmpleado);
    const cajaAdmin = num(u.cajaAdmin);

    saldos.usuarios[uDoc.id] = { cajaEmpleado, cajaAdmin };

    if (cajaEmpleado < 0) {
      hallazgos.push(
        hallazgo("critico", "caja_negativa", {
          wallet: "cajaEmpleado",
          usuarioId: uDoc.id,
          valor: cajaEmpleado,
        })
      );
    }
    if (cajaAdmin < 0) {
      hallazgos.push(
        hallazgo("critico", "caja_negativa", {
          wallet: "cajaAdmin",
          usuarioId: uDoc.id,
          valor: cajaAdmin,
        })
      );
    }

    if (rutaId) {
      cajaEmpleadoPorRuta.set(
        rutaId,
        round2((cajaEmpleadoPorRuta.get(rutaId) ?? 0) + cajaEmpleado)
      );
    }
  }

  const saldoPendientePorRuta = new Map();
  const prestamosPorSolicitud = new Map();
  for (const pDoc of prestamosSnap.docs) {
    const p = pDoc.data();
    const rutaId = typeof p.rutaId === "string" ? p.rutaId.trim() : "";
    const estado = p.estado === "pagado" || p.estado === "castigado" ? p.estado : "activo";
    if (rutaId && estado === "activo") {
      saldoPendientePorRuta.set(
        rutaId,
        round2((saldoPendientePorRuta.get(rutaId) ?? 0) + num(p.saldoPendiente))
      );
    }
    const solicitudId = typeof p.solicitudId === "string" ? p.solicitudId.trim() : "";
    if (solicitudId) {
      const lista = prestamosPorSolicitud.get(solicitudId) ?? [];
      lista.push(pDoc.id);
      prestamosPorSolicitud.set(solicitudId, lista);
    }
  }

  for (const rDoc of rutasSnap.docs) {
    const r = rDoc.data();
    const cajaRuta = num(r.cajaRuta);
    const cajasEmpleados = num(r.cajasEmpleados);
    const inversiones = num(r.inversiones);
    const perdidas = num(r.perdidas);
    const capitalTotal = num(r.capitalTotal);

    saldos.rutas[rDoc.id] = {
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
      capitalTotal,
      ganancias: num(r.ganancias),
    };

    const esperado = round2(cajaRuta + cajasEmpleados + inversiones - perdidas);
    if (Math.abs(esperado - capitalTotal) > TOLERANCIA_COP) {
      hallazgos.push(
        hallazgo("critico", "capital_total_descuadrado", {
          rutaId: rDoc.id,
          rutaNombre: r.nombre ?? null,
          capitalTotal,
          esperado,
          diferencia: round2(capitalTotal - esperado),
        })
      );
    }

    if (cajaRuta < 0) {
      hallazgos.push(
        hallazgo("critico", "caja_negativa", {
          wallet: "cajaRuta",
          rutaId: rDoc.id,
          valor: cajaRuta,
        })
      );
    }

    const sumaEmpleados = cajaEmpleadoPorRuta.get(rDoc.id) ?? 0;
    if (Math.abs(sumaEmpleados - cajasEmpleados) > TOLERANCIA_COP) {
      hallazgos.push(
        hallazgo("alto", "cajas_empleados_descuadrado", {
          rutaId: rDoc.id,
          rutaNombre: r.nombre ?? null,
          cajasEmpleados,
          sumaCajaEmpleado: sumaEmpleados,
          diferencia: round2(cajasEmpleados - sumaEmpleados),
        })
      );
    }

    const saldoPendiente = saldoPendientePorRuta.get(rDoc.id) ?? 0;
    if (saldoPendiente < inversiones - TOLERANCIA_COP) {
      // Menos por cobrar que capital colocado: posible desembolso sin préstamo.
      hallazgos.push(
        hallazgo("medio", "inversiones_sin_respaldo", {
          rutaId: rDoc.id,
          rutaNombre: r.nombre ?? null,
          inversiones,
          saldoPendienteActivo: saldoPendiente,
          diferencia: round2(inversiones - saldoPendiente),
        })
      );
    }
  }

  const cajaEmpresaSnap = await empresaRef
    .collection(CAPITAL_SUBCOLLECTION)
    .doc(CAPITAL_CAJA_EMPRESA_DOC)
    .get();
  const cajaEmpresa = cajaEmpresaSnap.exists ? num(cajaEmpresaSnap.data().cajaEmpresa) : 0;
  saldos.cajaEmpresa = cajaEmpresa;
  if (cajaEmpresa < 0) {
    hallazgos.push(
      hallazgo("critico", "caja_negativa", { wallet: "cajaEmpresa", valor: cajaEmpresa })
    );
  }

  const solicitudesSnap = await empresaRef
    .collection(SOLICITUDES_PRESTAMO_SUBCOLLECTION)
    .get();
  for (const sDoc of solicitudesSnap.docs) {
    const s = sDoc.data();
    // Síntoma del bug de aprobación: dinero movido pero solicitud sin cerrar.
    if (s.estado === "pendiente" && typeof s.prestamoId === "string" && s.prestamoId.trim()) {
      hallazgos.push(
        hallazgo("critico", "solicitud_prestamo_pendiente_con_prestamo", {
          solicitudId: sDoc.id,
          prestamoId: s.prestamoId,
        })
      );
    }
  }

  for (const [solicitudId, prestamoIds] of prestamosPorSolicitud.entries()) {
    if (prestamoIds.length > 1) {
      hallazgos.push(
        hallazgo("critico", "prestamos_duplicados_por_solicitud", {
          solicitudId,
          prestamoIds,
        })
      );
    }
  }

  const entregasSnap = await empresaRef
    .collection(SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION)
    .get();
  for (const eDoc of entregasSnap.docs) {
    const e = eDoc.data();
    if (e.estado !== "pendiente") continue;
    const empleadoUid = typeof e.empleadoUid === "string" ? e.empleadoUid.trim() : "";
    const saldoEmpleado = empleadoUid ? saldos.usuarios[empleadoUid]?.cajaEmpleado : undefined;
    // Caja en cero con solicitud pendiente: el traspaso corrió pero no se cerró.
    if (typeof saldoEmpleado === "number" && saldoEmpleado === 0) {
      hallazgos.push(
        hallazgo("alto", "entrega_pendiente_con_caja_en_cero", {
          solicitudId: eDoc.id,
          empleadoUid,
        })
      );
    }
  }

  const operacionesSnap = await empresaRef
    .collection(FINANCIAL_OPERATIONS_SUBCOLLECTION)
    .where("status", "==", "processing")
    .get()
    .catch(() => null);
  if (operacionesSnap) {
    const ahora = Date.now();
    for (const oDoc of operacionesSnap.docs) {
      const o = oDoc.data();
      const edadMs = ahora - toMillis(o.createdAt);
      if (edadMs > PROCESSING_STALE_MS) {
        hallazgos.push(
          hallazgo("alto", "idempotencia_bloqueada", {
            key: oDoc.id,
            endpoint: o.endpoint ?? null,
            edadMinutos: Math.round(edadMs / 60000),
          })
        );
      }
    }
  }

  return {
    empresaId,
    totales: {
      rutas: rutasSnap.size,
      usuarios: usuariosSnap.size,
      prestamos: prestamosSnap.size,
      solicitudesPrestamo: solicitudesSnap.size,
      solicitudesEntrega: entregasSnap.size,
    },
    saldos,
    hallazgos,
  };
}

async function main() {
  console.log("Auditoría de integridad financiera (solo lectura)\n");

  let empresaIds;
  if (empresaFilter) {
    empresaIds = [empresaFilter];
  } else {
    const snap = await db.collection(EMPRESAS_COLLECTION).get();
    empresaIds = snap.docs.map((d) => d.id);
  }

  const empresas = [];
  for (const empresaId of empresaIds) {
    const resultado = await auditarEmpresa(empresaId);
    empresas.push(resultado);

    const porSeveridad = resultado.hallazgos.reduce((acc, h) => {
      acc[h.severidad] = (acc[h.severidad] ?? 0) + 1;
      return acc;
    }, {});

    if (resultado.hallazgos.length === 0) {
      console.log(`[${empresaId}] OK — sin hallazgos`);
    } else {
      console.log(
        `[${empresaId}] ${resultado.hallazgos.length} hallazgo(s): ${JSON.stringify(porSeveridad)}`
      );
      for (const h of resultado.hallazgos) {
        const { severidad, tipo, ...resto } = h;
        console.log(`  [${severidad}] ${tipo} ${JSON.stringify(resto)}`);
      }
    }
  }

  const reporte = {
    generadoEn: new Date().toISOString(),
    empresas,
    resumen: {
      empresas: empresas.length,
      hallazgos: empresas.reduce((n, e) => n + e.hallazgos.length, 0),
      criticos: empresas.reduce(
        (n, e) => n + e.hallazgos.filter((h) => h.severidad === "critico").length,
        0
      ),
    },
  };

  if (outPath) {
    const destino = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    fs.writeFileSync(destino, JSON.stringify(reporte, null, 2), "utf8");
    console.log(`\nReporte guardado en ${destino}`);
  }

  console.log(
    `\nTotal: ${reporte.resumen.hallazgos} hallazgo(s), ${reporte.resumen.criticos} crítico(s).`
  );
  process.exit(reporte.resumen.criticos > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
