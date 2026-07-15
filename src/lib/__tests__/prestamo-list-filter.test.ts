import {
  aplicarFiltroNombrePrestamos,
  dedupePrestamos,
  filtrarPrestamosConConteos,
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
    fechaFinal: null,
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

// ─── filtrarPrestamosConConteos ───────────────────────────────────────────────

describe("filtrarPrestamosConConteos", () => {
  const pActivo = prestamo({ id: "a1", clienteId: "c1", estado: "activo", creadoEn: "2026-06-05T12:00:00.000Z" });
  const pMoroso = prestamo({
    id: "a2",
    clienteId: "c2",
    estado: "activo",
    moroso: true,
    saldoPendiente: 5_000,
    creadoEn: "2026-06-05T12:00:00.000Z",
  });
  const pPagado = prestamo({ id: "p1", clienteId: "c1", estado: "pagado", saldoPendiente: 0, creadoEn: "2026-06-05T12:00:00.000Z" });
  const pCastigado = prestamo({ id: "x1", clienteId: "c2", estado: "castigado", saldoPendiente: 0, creadoEn: "2026-06-05T12:00:00.000Z" });

  const baseParams = {
    prestamos: [pActivo, pMoroso],
    prestamosPagados: [pPagado],
    prestamosCastigados: [pCastigado],
    filtroContable: { modo: "todo" } as const,
    filtroEstado: "todos" as const,
    filtroRutaId: "",
    clientePorId: clientes,
    periodos,
  };

  it("conteos correctos sobre el universo completo", () => {
    const { conteos } = filtrarPrestamosConConteos(baseParams);
    expect(conteos.todos).toBe(4);
    expect(conteos.activo).toBe(2); // activo incluye morosos
    expect(conteos.pagado).toBe(1);
    expect(conteos.castigado).toBe(1);
    expect(conteos.moroso).toBe(1);
  });

  it("listaEstado filtroEstado=activo devuelve solo activos", () => {
    const { listaEstado } = filtrarPrestamosConConteos({ ...baseParams, filtroEstado: "activo" });
    expect(listaEstado.map((p) => p.id)).toEqual(expect.arrayContaining(["a1", "a2"]));
    expect(listaEstado).toHaveLength(2);
  });

  it("listaEstado filtroEstado=moroso devuelve solo morosos", () => {
    const { listaEstado } = filtrarPrestamosConConteos({ ...baseParams, filtroEstado: "moroso" });
    expect(listaEstado.map((p) => p.id)).toEqual(["a2"]);
  });

  it("listaEstado filtroEstado=pagado devuelve solo pagados", () => {
    const { listaEstado } = filtrarPrestamosConConteos({ ...baseParams, filtroEstado: "pagado" });
    expect(listaEstado.map((p) => p.id)).toEqual(["p1"]);
  });

  it("no duplica items presentes en múltiples arrays", () => {
    // pActivo aparece en prestamos Y prestamosPagados — solo debe contarse una vez
    const duplicado = { ...pActivo, estado: "pagado" as const };
    const { conteos } = filtrarPrestamosConConteos({
      ...baseParams,
      prestamos: [pActivo],
      prestamosPagados: [duplicado],
      prestamosCastigados: [],
    });
    expect(conteos.todos).toBe(1);
  });

  it("conteos estables al cambiar filtroEstado (solo cambia listaEstado)", () => {
    const r1 = filtrarPrestamosConConteos({ ...baseParams, filtroEstado: "activo" });
    const r2 = filtrarPrestamosConConteos({ ...baseParams, filtroEstado: "pagado" });
    // Los conteos deben ser idénticos — ambas llamadas parten del mismo universo
    expect(r1.conteos).toEqual(r2.conteos);
    // Pero las listas deben diferir
    expect(r1.listaEstado.map((p) => p.id)).not.toEqual(r2.listaEstado.map((p) => p.id));
  });

  it("aplica filtroRutaId correctamente", () => {
    // pActivo → c1 → rutaId r1; pMoroso → c2 → rutaId r2
    const { conteos } = filtrarPrestamosConConteos({ ...baseParams, filtroRutaId: "r1" });
    expect(conteos.activo).toBe(1);
    expect(conteos.moroso).toBe(0);
  });
});

// ─── aplicarFiltroNombrePrestamos ─────────────────────────────────────────────

describe("aplicarFiltroNombrePrestamos", () => {
  const items = [
    prestamo({ id: "a", clienteId: "c1", estado: "activo" }),
    prestamo({ id: "b", clienteId: "c2", estado: "activo" }),
  ];

  it("devuelve la lista intacta si no hay filtro", () => {
    expect(aplicarFiltroNombrePrestamos(items, "", clientes)).toHaveLength(2);
    expect(aplicarFiltroNombrePrestamos(items, undefined, clientes)).toHaveLength(2);
  });

  it("filtra por nombre parcial case-insensitive", () => {
    const out = aplicarFiltroNombrePrestamos(items, "ANA", clientes);
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("filtra por cédula", () => {
    const out = aplicarFiltroNombrePrestamos(items, "999", clientes);
    expect(out.map((p) => p.id)).toEqual(["b"]);
  });

  it("filtra por código de cliente", () => {
    // c1 tiene codigo "R1-001"
    const out = aplicarFiltroNombrePrestamos(items, "R1-001", clientes);
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });
});
