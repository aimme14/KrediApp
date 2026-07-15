import type { ClienteItem } from "@/lib/empresa-api";
import { formatClienteCodigoRutaYNumero } from "@/lib/empresa-api";

export type FiltroPrestamoActivoCliente = "todos" | "si" | "no";

/** Misma lógica de chips que en la lista de clientes (Todos / A-Z / préstamo). */
export type VistaExportCliente = "todos" | "az" | "si" | "no";

export type ExportClientesParams = {
  clientes: ClienteItem[];
  rutaPorId: Record<string, string>;
  vistaLista: VistaExportCliente;
  filtroRutaId: string;
  filtroNombre?: string;
  nombreEmpresa: string;
  nombreRuta?: string;
};

export function filtroPrestamoDesdeVista(
  vista: VistaExportCliente
): FiltroPrestamoActivoCliente {
  return vista === "si" ? "si" : vista === "no" ? "no" : "todos";
}

export function filtrarClientesParaExport(
  clientes: ClienteItem[],
  filtroNombre: string | undefined,
  filtroRutaId: string,
  filtroPrestamoActivo: FiltroPrestamoActivoCliente
): ClienteItem[] {
  const lower = filtroNombre?.trim().toLowerCase() ?? "";
  return clientes.filter((c) => {
    if (lower) {
      const nombre = (c.nombre ?? "").toLowerCase();
      const codigo = c.codigo ? formatClienteCodigoRutaYNumero(c.codigo).toLowerCase() : "";
      const cedula = (c.cedula ?? "").toLowerCase();
      const coincide =
        nombre.includes(lower) || codigo.includes(lower) || cedula.includes(lower);
      if (!coincide) return false;
    }
    if (filtroPrestamoActivo === "si" && !c.prestamo_activo) return false;
    if (filtroPrestamoActivo === "no" && c.prestamo_activo) return false;
    if (filtroRutaId && (c.rutaId ?? "") !== filtroRutaId) return false;
    return true;
  });
}

export function ordenarClientesParaExport(
  clientes: ClienteItem[],
  vista: VistaExportCliente
): ClienteItem[] {
  return [...clientes].sort((a, b) => {
    if (vista === "az") {
      return (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", {
        sensitivity: "base",
      });
    }
    return (
      (b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0) -
      (a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0)
    );
  });
}

export async function generarExcelClientes(params: ExportClientesParams): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;

  const {
    clientes,
    rutaPorId,
    vistaLista,
    filtroRutaId,
    filtroNombre,
    nombreEmpresa,
    nombreRuta,
  } = params;

  const filtroPrestamoActivo = filtroPrestamoDesdeVista(vistaLista);
  const fechaExport = new Date().toLocaleDateString("es-CO", { dateStyle: "long" });
  const filtroLabel =
    vistaLista === "az"
      ? "Todos (A-Z)"
      : filtroPrestamoActivo === "si"
        ? "Con préstamo"
        : filtroPrestamoActivo === "no"
          ? "Sin préstamo"
          : "Todos";
  const rutaLabel = filtroRutaId && nombreRuta ? nombreRuta : "Todas las rutas";

  const wb = new ExcelJS.Workbook();
  wb.creator = "KrediApp";
  wb.created = new Date();

  const ws = wb.addWorksheet("Clientes", {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  const COLS = 9;

  const merge = (row: number) => ws.mergeCells(row, 1, row, COLS);

  merge(1);
  const t = ws.getCell(1, 1);
  t.value = nombreEmpresa;
  t.font = { bold: true, size: 14 };

  merge(2);
  const s1 = ws.getCell(2, 1);
  s1.value = "Reporte de clientes";
  s1.font = { bold: true, size: 11 };

  merge(3);
  const s2 = ws.getCell(3, 1);
  s2.value = `Filtro: ${filtroLabel}  ·  Ruta: ${rutaLabel}${filtroNombre?.trim() ? `  ·  Búsqueda: ${filtroNombre.trim()}` : ""}`;
  s2.font = { size: 10, color: { argb: "FF666666" } };

  merge(4);
  const s3 = ws.getCell(4, 1);
  s3.value = `Generado: ${fechaExport}  ·  ${clientes.length} cliente${clientes.length !== 1 ? "s" : ""}`;
  s3.font = { size: 10, color: { argb: "FF666666" } };

  ws.addRow([]);

  const HEADERS = [
    "Código",
    "Nombre",
    "Cédula",
    "Teléfono",
    "Ubicación",
    "Dirección",
    "Ruta",
    "Préstamo activo",
    "Moroso",
  ];

  const filaH = ws.addRow(HEADERS);
  filaH.height = 20;
  filaH.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF334155" } } };
  });

  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: COLS } };

  const ordenados = ordenarClientesParaExport(clientes, vistaLista);

  ordenados.forEach((c, idx) => {
    const fila = ws.addRow([
      c.codigo ? formatClienteCodigoRutaYNumero(c.codigo) : "—",
      c.nombre ?? "—",
      c.cedula ?? "—",
      c.telefono ?? "—",
      c.ubicacion ?? "—",
      c.direccion ?? "—",
      rutaPorId[c.rutaId ?? ""] ?? "—",
      c.prestamo_activo ? "Sí" : "No",
      c.moroso ? "Sí" : "No",
    ]);

    if (idx % 2 === 0) {
      fila.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }

    const celdaMoroso = fila.getCell(9);
    if (c.moroso) {
      celdaMoroso.font = { color: { argb: "FFDC2626" }, bold: true };
    }

    const celdaPrestamo = fila.getCell(8);
    if (c.prestamo_activo) {
      celdaPrestamo.font = { color: { argb: "FF16A34A" }, bold: true };
    }
  });

  ws.addRow([]);
  const filaT = ws.addRow([
    "",
    `TOTAL: ${clientes.length} cliente${clientes.length !== 1 ? "s" : ""}`,
    "",
    "",
    "",
    "",
    "",
    `Con préstamo: ${clientes.filter((c) => c.prestamo_activo).length}`,
    `Morosos: ${clientes.filter((c) => c.moroso).length}`,
  ]);
  filaT.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  ws.columns = [
    { width: 10 },
    { width: 28 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 24 },
    { width: 18 },
    { width: 15 },
    { width: 12 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes_${rutaLabel.toLowerCase().replace(/[\s]+/g, "_")}_${Date.now()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
