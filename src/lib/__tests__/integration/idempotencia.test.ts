/**
 * Lock de idempotencia financiera.
 *
 * Antes del fix: un proceso que moría dejaba la clave en `processing` y todo
 * reintento devolvía 409 para siempre; y un fallo de negocio se cacheaba como
 * resultado terminal, bloqueando el reintento legítimo tras corregir la causa.
 */

import {
  PROCESSING_TTL_MS,
  runIdempotent,
  startIdempotentOperation,
  type IdempotentOutcome,
} from "@/lib/financial-idempotency";
import {
  contarResultados,
  db,
  empresaRef,
  FINANCIAL_OPERATIONS,
  limpiarEmpresa,
  nuevaEmpresaId,
} from "./helpers";

describe("Idempotencia financiera", () => {
  const empresaId = nuevaEmpresaId("idem");
  const uid = "admin-1";

  afterAll(async () => {
    await limpiarEmpresa(empresaId);
  });

  function operacion(key: string, handler: () => Promise<IdempotentOutcome>) {
    return runIdempotent({
      db,
      empresaId,
      key,
      endpoint: "test:operacion",
      uid,
      handler,
    });
  }

  it("ejecuta el handler una sola vez ante llamadas concurrentes con la misma clave", async () => {
    const key = "concurrente-1";
    let ejecuciones = 0;

    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        operacion(key, async () => {
          ejecuciones += 1;
          await new Promise((r) => setTimeout(r, 50));
          return { status: 200, payload: { ok: true, n: ejecuciones } };
        })
      )
    );

    expect(ejecuciones).toBe(1);

    // Los que no ganaron el lock ven el resultado cacheado o un 409 transitorio.
    const exitosos = resultados.filter((r) => r.status === 200);
    const enProceso = resultados.filter((r) => r.status === 409);
    expect(exitosos.length + enProceso.length).toBe(5);
    expect(exitosos.length).toBeGreaterThanOrEqual(1);
  });

  it("replaya el resultado cacheado de una operación exitosa", async () => {
    const key = "replay-1";

    const primera = await operacion(key, async () => ({
      status: 200,
      payload: { id: "abc-123" },
    }));
    const segunda = await operacion(key, async () => {
      throw new Error("no debería ejecutarse");
    });

    expect(primera).toEqual({ status: 200, payload: { id: "abc-123" } });
    expect(segunda).toEqual({ status: 200, payload: { id: "abc-123" } });
  });

  it("libera la clave tras un fallo de negocio, permitiendo reintentar", async () => {
    const key = "reintento-tras-fallo";

    const fallida = await operacion(key, async () => ({
      status: 400,
      payload: { error: "Saldo insuficiente" },
    }));
    expect(fallida.status).toBe(400);

    // Escenario real: el admin fondea la caja y reintenta con la misma clave.
    const exitosa = await operacion(key, async () => ({
      status: 200,
      payload: { id: "ok-tras-fondear" },
    }));
    expect(exitosa).toEqual({ status: 200, payload: { id: "ok-tras-fondear" } });
  });

  it("libera la clave cuando el handler lanza una excepción no controlada", async () => {
    const key = "excepcion-no-controlada";

    await expect(
      operacion(key, async () => {
        throw new Error("caída inesperada");
      })
    ).rejects.toThrow("caída inesperada");

    const doc = await empresaRef(empresaId)
      .collection(FINANCIAL_OPERATIONS)
      .doc(key)
      .get();
    expect(doc.exists).toBe(false);

    const reintento = await operacion(key, async () => ({
      status: 200,
      payload: { ok: true },
    }));
    expect(reintento.status).toBe(200);
  });

  it("devuelve 409 mientras otra ejecución tiene el lock vigente", async () => {
    const key = "lock-vigente";

    const primera = await startIdempotentOperation({
      db,
      empresaId,
      key,
      endpoint: "test:operacion",
      uid,
    });
    expect(primera.replay).toBe(false);

    const segunda = await startIdempotentOperation({
      db,
      empresaId,
      key,
      endpoint: "test:operacion",
      uid,
    });
    expect(segunda).toMatchObject({ replay: true, status: 409 });
  });

  it("reclama un lock huérfano cuando supera el TTL", async () => {
    const key = "lock-huerfano";
    const ahora = Date.now();

    const primera = await startIdempotentOperation({
      db,
      empresaId,
      key,
      endpoint: "test:operacion",
      uid,
      nowMs: ahora,
    });
    expect(primera.replay).toBe(false);

    // El proceso que tomó el lock murió: nadie llamó a finish.
    const dentroDelTtl = await startIdempotentOperation({
      db,
      empresaId,
      key,
      endpoint: "test:operacion",
      uid,
      nowMs: ahora + PROCESSING_TTL_MS - 1_000,
    });
    expect(dentroDelTtl).toMatchObject({ replay: true, status: 409 });

    const vencido = await startIdempotentOperation({
      db,
      empresaId,
      key,
      endpoint: "test:operacion",
      uid,
      nowMs: ahora + PROCESSING_TTL_MS + 1_000,
    });
    expect(vencido.replay).toBe(false);
  });

  it("sin clave no aplica deduplicación: cada llamada ejecuta", async () => {
    let ejecuciones = 0;
    const resultados = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        runIdempotent({
          db,
          empresaId,
          key: undefined,
          endpoint: "test:sin-clave",
          uid,
          handler: async () => {
            ejecuciones += 1;
            return { status: 200, payload: { ok: true } };
          },
        })
      )
    );

    expect(contarResultados(resultados).fallos).toBe(0);
    expect(ejecuciones).toBe(3);
  });
});
