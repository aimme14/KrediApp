/**
 * Entrega del reporte del día (traspaso cajaEmpleado → cajaRuta).
 *
 * Antes del fix el estado `aprobada` se escribía después de generar el reporte
 * y el PDF, fuera de la transacción del dinero: una caída en medio dejaba el
 * efectivo movido con la solicitud todavía pendiente, invitando a aprobarla de
 * nuevo.
 */

import { entregarReporteTrabajadorARutaConValidacion } from "@/lib/entregar-reporte-empleado-admin";
import {
  assertInvarianteRuta,
  contarResultados,
  db,
  empresaRef,
  leerRuta,
  leerUsuario,
  limpiarEmpresa,
  nuevaEmpresaId,
  num,
  seedAdmin,
  seedEmpleado,
  seedRuta,
  SOLICITUDES_ENTREGA,
} from "./helpers";

const empresaId = nuevaEmpresaId("entrega");
const adminUid = "admin-1";
const empleadoUid = "empleado-1";
const rutaId = "ruta-1";

async function crearSolicitud(solicitudId: string, montoAlSolicitar: number) {
  await empresaRef(empresaId)
    .collection(SOLICITUDES_ENTREGA)
    .doc(solicitudId)
    .set({
      empleadoUid,
      empleadoNombre: "Trabajador de prueba",
      rutaId,
      rutaNombre: "Ruta de prueba",
      adminId: adminUid,
      estado: "pendiente",
      comentarioTrabajador: null,
      montoAlSolicitar,
      creadaEn: new Date(),
    });

  return empresaRef(empresaId).collection(SOLICITUDES_ENTREGA).doc(solicitudId);
}

describe("Entrega de reporte — concurrencia", () => {
  beforeEach(async () => {
    await seedAdmin({ empresaId, adminUid, cajaAdmin: 0 });
    await seedRuta({
      empresaId,
      rutaId,
      adminId: adminUid,
      cajaRuta: 100_000,
      cajasEmpleados: 60_000,
    });
    await seedEmpleado({
      empresaId,
      empleadoUid,
      rutaId,
      adminId: adminUid,
      cajaEmpleado: 60_000,
    });

    const solicitudes = await empresaRef(empresaId).collection(SOLICITUDES_ENTREGA).get();
    await Promise.all(solicitudes.docs.map((d) => d.ref.delete()));
  });

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
  });

  it("cuatro aprobaciones simultáneas ejecutan un solo traspaso", async () => {
    const solRef = await crearSolicitud("sol-conc", 60_000);

    const resultados = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        entregarReporteTrabajadorARutaConValidacion(
          db,
          empresaId,
          empleadoUid,
          solRef,
          adminUid,
          { reporteDiaId: `reporte-${i}` }
        )
      )
    );

    const { exitos } = contarResultados(resultados);
    expect(exitos).toBe(1);

    const empleado = await leerUsuario(empresaId, empleadoUid);
    const ruta = await leerRuta(empresaId, rutaId);

    expect(num(empleado.cajaEmpleado)).toBe(0);
    expect(num(ruta.cajaRuta)).toBe(160_000);
    expect(num(ruta.cajasEmpleados)).toBe(0);
    await assertInvarianteRuta(empresaId, rutaId);
  });

  it("la solicitud queda aprobada con el monto y el reporte en la misma transacción", async () => {
    const solRef = await crearSolicitud("sol-cierre", 60_000);

    await entregarReporteTrabajadorARutaConValidacion(
      db,
      empresaId,
      empleadoUid,
      solRef,
      adminUid,
      { reporteDiaId: "reporte-abc" }
    );

    const sol = await solRef.get();
    expect(sol.data()?.estado).toBe("aprobada");
    expect(num(sol.data()?.montoEntregadoEfectivo)).toBe(60_000);
    expect(sol.data()?.reporteDiaId).toBe("reporte-abc");
    expect(sol.data()?.resueltaPorUid).toBe(adminUid);
  });

  it("no permite aprobar dos veces de forma secuencial", async () => {
    const solRef = await crearSolicitud("sol-doble", 60_000);

    await entregarReporteTrabajadorARutaConValidacion(
      db,
      empresaId,
      empleadoUid,
      solRef,
      adminUid,
      { reporteDiaId: "reporte-1" }
    );

    await expect(
      entregarReporteTrabajadorARutaConValidacion(
        db,
        empresaId,
        empleadoUid,
        solRef,
        adminUid,
        { reporteDiaId: "reporte-2" }
      )
    ).rejects.toThrow("La solicitud ya fue resuelta");

    const ruta = await leerRuta(empresaId, rutaId);
    expect(num(ruta.cajaRuta)).toBe(160_000);
  });

  it("un admin ajeno no puede cerrar la entrega", async () => {
    const solRef = await crearSolicitud("sol-ajena", 60_000);

    await expect(
      entregarReporteTrabajadorARutaConValidacion(
        db,
        empresaId,
        empleadoUid,
        solRef,
        "admin-2",
        { reporteDiaId: "reporte-x" }
      )
    ).rejects.toThrow("No podés confirmar solicitudes de otra administración");

    const empleado = await leerUsuario(empresaId, empleadoUid);
    expect(num(empleado.cajaEmpleado)).toBe(60_000);
  });

  it("registra el descuadre en la ruta en vez de ocultarlo al truncar", async () => {
    // La ruta cree que sus empleados tienen 10.000, pero el trabajador entrega 60.000.
    await seedRuta({
      empresaId,
      rutaId,
      adminId: adminUid,
      cajaRuta: 100_000,
      cajasEmpleados: 10_000,
    });
    const solRef = await crearSolicitud("sol-descuadre", 60_000);

    await entregarReporteTrabajadorARutaConValidacion(
      db,
      empresaId,
      empleadoUid,
      solRef,
      adminUid,
      { reporteDiaId: "reporte-desc" }
    );

    const ruta = await leerRuta(empresaId, rutaId);
    expect(num(ruta.cajasEmpleados)).toBe(0);
    expect(ruta.descuadreCajasEmpleados).toBeDefined();
    expect(num((ruta.descuadreCajasEmpleados as Record<string, unknown>).faltante)).toBe(
      50_000
    );
  });
});
