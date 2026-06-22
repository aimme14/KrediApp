import {
  dedupePrestamos,
  filtrarPrestamosParaListado,
  prestamoCoincideRuta,
} from "@/lib/prestamo-list-filter";
import type { ClienteItem, PrestamoItem } from "@/lib/empresa-api";

function prestamo(
  partial: Partial<PrestamoItem> & Pick<PrestamoItem, "id" | "clienteId" | "estado">
): PrestamoItem {
  return {
    rutaId: "",
    adminId: "a1",
    empleadoId: "e1",
    monto: 100_000,
    interes: 10,
    modalidad: "mensual",
    numeroCuotas: 4,
    totalAPagar: 110_000,
    saldoPendiente: 50_000,
    fechaInicio: "2026-06-01",
    fechaVencimiento: null,
    ...partial,
  };
}

const clientes: Record<string, ClienteItem> = {
  c1: {
    id: "c1",
    nombre: "Ana García",
    ubicacion: "",
    direccion: "",
    telefono: "",
    cedula: "123456",
    rutaId: "r1",
    adminId: "a1",
    prestamo_activo: true,
    moroso: false,
    fechaCreacion: null,
    codigo: "R1-001",
  },
  c2: {
    id: "c2",
    nombre: "Luis Pérez",
    ubicacion: "",
    direccion: "",
    telefono: "",
    cedula: "999",
    rutaId: "r2",
    adminId: "a1",
    prestamo_activo: true,
    moroso: true,
    fechaCreacion: null,
  },
};

const periodos = [
  {
    id: "p1",
    estado: "abierto" as const,
    fechaApertura: "2026-06-01T13:00:00.000Z",
    fechaCierre: null,
    abiertoPorUid: "a1",
    cerradoPorUid: null,
  },
];

describe("prestamo-list-filter", () => {
  it("dedupePrestamos elimina duplicados por id", () => {
    const a = prestamo({ id: "1", clienteId: "c1", estado: "activo" });
    const b = prestamo({ id: "1", clienteId: "c1", estado: "activo", monto: 200_000 });
    expect(dedupePrestamos([a, b])).toHaveLength(1);
    expect(dedupePrestamos([a, b])[0].monto).toBe(100_000);
  });

  it("prestamoCoincideRuta usa ruta del cliente si falta en préstamo", () => {
    const p = prestamo({ id: "1", clienteId: "c1", estado: "activo", rutaId: "" });
    expect(prestamoCoincideRuta(p, "r1", clientes)).toBe(true);
    expect(prestamoCoincideRuta(p, "r2", clientes)).toBe(false);
  });

  it("filtra por estado activo", () => {
    const activos = [prestamo({ id: "a", clienteId: "c1", estado: "activo", creadoEn: "2026-06-05T12:00:00.000Z" })];
    const pagados = [prestamo({ id: "p", clienteId: "c2", estado: "pagado", saldoPendiente: 0, creadoEn: "2026-06-05T12:00:00.000Z" })];
    const out = filtrarPrestamosParaListado({
      prestamos: activos,
      prestamosPagados: pagados,
      prestamosCastigados: [],
      filtroContable: { modo: "todo" },
      filtroEstado: "activo",
      filtroRutaId: "",
      clientePorId: clientes,
      periodos,
    });
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("filtra morosos pendientes", () => {
    const activos = [
      prestamo({
        id: "m",
        clienteId: "c2",
        estado: "activo",
        moroso: true,
        saldoPendiente: 10_000,
        creadoEn: "2026-06-05T12:00:00.000Z",
      }),
      prestamo({
        id: "ok",
        clienteId: "c1",
        estado: "activo",
        creadoEn: "2026-06-05T12:00:00.000Z",
      }),
    ];
    const out = filtrarPrestamosParaListado({
      prestamos: activos,
      prestamosPagados: [],
      prestamosCastigados: [],
      filtroContable: { modo: "todo" },
      filtroEstado: "moroso",
      filtroRutaId: "",
      clientePorId: clientes,
      periodos,
    });
    expect(out.map((x) => x.id)).toEqual(["m"]);
  });

  it("filtra por nombre de cliente", () => {
    const activos = [
      prestamo({ id: "a", clienteId: "c1", estado: "activo", creadoEn: "2026-06-05T12:00:00.000Z" }),
      prestamo({ id: "b", clienteId: "c2", estado: "activo", creadoEn: "2026-06-05T12:00:00.000Z" }),
    ];
    const out = filtrarPrestamosParaListado({
      prestamos: activos,
      prestamosPagados: [],
      prestamosCastigados: [],
      filtroContable: { modo: "todo" },
      filtroEstado: "activo",
      filtroRutaId: "",
      filtroNombre: "garcía",
      clientePorId: clientes,
      periodos,
    });
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });
});
