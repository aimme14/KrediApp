/**
 * Invariantes bajo carga mixta.
 *
 * Ejecuta secuencias aleatorias de operaciones de dinero concurrentes y
 * verifica tras cada ronda que el patrimonio de la ruta sigue cuadrando y que
 * ninguna caja quedó en negativo. Es la red que atrapa las combinaciones que
 * no se nos ocurrió escribir como test individual.
 */

import { descontarCajaAdmin, getCajaAdmin, sumarCajaAdmin } from "@/lib/admin-capital";
import { registrarGastoOperativoEmpleadoDesdeApi } from "@/lib/empleado-gasto-operativo-admin";
import { registrarPrestamoDesdeCajaEmpleado } from "@/lib/ruta-financiera-admin";
import { descontarCajaRutaAdmin } from "@/lib/ruta-financiera-admin";
import {
  assertInvarianteRuta,
  db,
  leerRuta,
  leerUsuario,
  limpiarEmpresa,
  nuevaEmpresaId,
  num,
  round2,
  seedAdmin,
  seedEmpleado,
  seedRuta,
} from "./helpers";

const empresaId = nuevaEmpresaId("invariantes");
const adminUid = "admin-1";
const empleadoUid = "empleado-1";
const rutaId = "ruta-1";

const CAJA_RUTA_INICIAL = 500_000;
const CAJA_EMPLEADO_INICIAL = 300_000;
const CAJA_ADMIN_INICIAL = 400_000;

/** Generador determinista: un fallo se puede reproducir con la misma semilla. */
function crearRandom(semilla: number): () => number {
  let estado = semilla;
  return () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return estado / 2147483648;
  };
}

async function estadoActual() {
  const ruta = await leerRuta(empresaId, rutaId);
  const empleado = await leerUsuario(empresaId, empleadoUid);
  return {
    cajaRuta: num(ruta.cajaRuta),
    cajasEmpleados: num(ruta.cajasEmpleados),
    inversiones: num(ruta.inversiones),
    perdidas: num(ruta.perdidas),
    capitalTotal: num(ruta.capitalTotal),
    cajaEmpleado: num(empleado.cajaEmpleado),
    cajaAdmin: await getCajaAdmin(db, empresaId, adminUid),
  };
}

describe("Invariantes bajo operaciones mixtas", () => {
  beforeEach(async () => {
    await seedAdmin({ empresaId, adminUid, cajaAdmin: CAJA_ADMIN_INICIAL });
    await seedRuta({
      empresaId,
      rutaId,
      adminId: adminUid,
      cajaRuta: CAJA_RUTA_INICIAL,
      cajasEmpleados: CAJA_EMPLEADO_INICIAL,
      inversiones: 0,
    });
    await seedEmpleado({
      empresaId,
      empleadoUid,
      rutaId,
      adminId: adminUid,
      cajaEmpleado: CAJA_EMPLEADO_INICIAL,
    });
  });

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
  });

  it.each([11, 29, 97])(
    "mantiene el capital cuadrado con operaciones concurrentes (semilla %i)",
    async (semilla) => {
      const random = crearRandom(semilla);

      const operaciones = [
        () => descontarCajaRutaAdmin(db, empresaId, adminUid, rutaId, 20_000),
        () =>
          registrarGastoOperativoEmpleadoDesdeApi(
            db,
            empresaId,
            empleadoUid,
            rutaId,
            10_000,
            "Gasto operativo",
            "otro"
          ),
        () => registrarPrestamoDesdeCajaEmpleado(db, empresaId, rutaId, empleadoUid, 30_000),
        () => descontarCajaAdmin(db, empresaId, adminUid, 25_000, "gasto admin"),
        () => sumarCajaAdmin(db, empresaId, adminUid, 15_000),
      ];

      for (let ronda = 0; ronda < 4; ronda += 1) {
        const lote = Array.from({ length: 4 }, () => {
          const op = operaciones[Math.floor(random() * operaciones.length)];
          return op();
        });

        // Algunas fallarán por saldo: lo que importa es que ninguna descuadre.
        await Promise.allSettled(lote);
        await assertInvarianteRuta(empresaId, rutaId);

        const estado = await estadoActual();
        expect(estado.cajaRuta).toBeGreaterThanOrEqual(-0.02);
        expect(estado.cajaEmpleado).toBeGreaterThanOrEqual(-0.02);
        expect(estado.cajaAdmin).toBeGreaterThanOrEqual(-0.02);
        expect(estado.inversiones).toBeGreaterThanOrEqual(-0.02);
      }
    }
  );

  it("cajaEmpleado del usuario y cajasEmpleados de la ruta se mueven juntas", async () => {
    await Promise.allSettled([
      registrarGastoOperativoEmpleadoDesdeApi(
        db,
        empresaId,
        empleadoUid,
        rutaId,
        10_000,
        "Gasto",
        "otro"
      ),
      registrarGastoOperativoEmpleadoDesdeApi(
        db,
        empresaId,
        empleadoUid,
        rutaId,
        20_000,
        "Gasto",
        "otro"
      ),
      registrarPrestamoDesdeCajaEmpleado(db, empresaId, rutaId, empleadoUid, 50_000),
    ]);

    const estado = await estadoActual();
    expect(estado.cajaEmpleado).toBe(estado.cajasEmpleados);
    await assertInvarianteRuta(empresaId, rutaId);
  });

  it("un desembolso desde caja del trabajador no cambia el capital total de la ruta", async () => {
    const antes = await estadoActual();

    await registrarPrestamoDesdeCajaEmpleado(db, empresaId, rutaId, empleadoUid, 80_000);

    const despues = await estadoActual();
    expect(despues.capitalTotal).toBe(antes.capitalTotal);
    expect(despues.inversiones).toBe(round2(antes.inversiones + 80_000));
    expect(despues.cajaEmpleado).toBe(round2(antes.cajaEmpleado - 80_000));
  });

  it("un gasto reduce el capital total exactamente en el monto del gasto", async () => {
    const antes = await estadoActual();

    await descontarCajaRutaAdmin(db, empresaId, adminUid, rutaId, 45_000);

    const despues = await estadoActual();
    expect(despues.capitalTotal).toBe(round2(antes.capitalTotal - 45_000));
    await assertInvarianteRuta(empresaId, rutaId);
  });
});
