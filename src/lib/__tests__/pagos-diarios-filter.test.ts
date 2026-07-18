import {
  calcularTotalesPagosDiariosAdmin,
  filtrarPagosDiariosAdmin,
  pagoCoincideNombreCliente,
  pagoCoincideRuta,
} from "@/lib/pagos-diarios-filter";
import type { PagoDiarioAdminItem } from "@/hooks/usePagosDiariosAdmin";

function pago(
  partial: Partial<PagoDiarioAdminItem> & Pick<PagoDiarioAdminItem, "id" | "tipo">
): PagoDiarioAdminItem {
  return {
    prestamoId: "pr1",
    monto: 50_000,
    fecha: "2026-07-18T15:00:00.000Z",
    metodoPago: "efectivo",
    clienteNombre: "Ana García",
    rutaNombre: "Ruta Norte",
    rutaId: "r1",
    empleadoId: "e1",
    registradoPorNombre: "Juan",
    cobradoPorRol: "trabajador",
    estado: "activo",
    evidencia: null,
    motivoNoPago: null,
    motivoPerdida: null,
    ...partial,
  };
}

describe("pagos-diarios-filter", () => {
  const pagos = [
    pago({ id: "p1", tipo: "pago", clienteNombre: "Ana García", rutaId: "r1", monto: 100_000, metodoPago: "efectivo" }),
    pago({ id: "p2", tipo: "pago", clienteNombre: "Luis Pérez", rutaId: "r2", monto: 30_000, metodoPago: "transferencia" }),
    pago({ id: "n1", tipo: "no_pago", clienteNombre: "María López", rutaId: "r1" }),
    pago({ id: "x1", tipo: "perdida", clienteNombre: "Pedro Ruiz", rutaId: "r2", monto: 200_000 }),
    pago({ id: "a1", tipo: "pago", clienteNombre: "Ana Duarte", rutaId: "r1", monto: 20_000, estado: "anulado" }),
  ];

  it("pagoCoincideRuta acepta todas las rutas cuando rutaId está vacío", () => {
    expect(pagoCoincideRuta(pagos[0], "")).toBe(true);
    expect(pagoCoincideRuta(pagos[1], "r2")).toBe(true);
    expect(pagoCoincideRuta(pagos[1], "r1")).toBe(false);
  });

  it("pagoCoincideNombreCliente busca por substring sin distinguir mayúsculas", () => {
    expect(pagoCoincideNombreCliente(pagos[0], "ana")).toBe(true);
    expect(pagoCoincideNombreCliente(pagos[0], "garcía")).toBe(true);
    expect(pagoCoincideNombreCliente(pagos[0], "luis")).toBe(false);
    expect(pagoCoincideNombreCliente(pagos[0], "")).toBe(true);
  });

  it("filtrarPagosDiariosAdmin combina ruta y nombre", () => {
    expect(filtrarPagosDiariosAdmin(pagos, { rutaId: "r1" })).toHaveLength(3);
    expect(filtrarPagosDiariosAdmin(pagos, { nombreCliente: "Ana" })).toHaveLength(2);
    expect(
      filtrarPagosDiariosAdmin(pagos, { rutaId: "r1", nombreCliente: "Ana García" })
    ).toHaveLength(1);
    expect(filtrarPagosDiariosAdmin(pagos, { rutaId: "r9" })).toHaveLength(0);
  });

  it("calcularTotalesPagosDiariosAdmin ignora anulados y clasifica métodos", () => {
    const totales = calcularTotalesPagosDiariosAdmin(pagos);
    expect(totales.countCobros).toBe(2);
    expect(totales.totalEfectivo).toBe(100_000);
    expect(totales.totalTransferencia).toBe(30_000);
    expect(totales.totalCobros).toBe(130_000);
    expect(totales.countNoPagos).toBe(1);
    expect(totales.countPerdidas).toBe(1);
  });

  it("calcularTotalesPagosDiariosAdmin sobre lista filtrada refleja solo esa ruta", () => {
    const filtrados = filtrarPagosDiariosAdmin(pagos, { rutaId: "r2" });
    const totales = calcularTotalesPagosDiariosAdmin(filtrados);
    expect(totales.countCobros).toBe(1);
    expect(totales.totalTransferencia).toBe(30_000);
    expect(totales.countPerdidas).toBe(1);
  });
});
