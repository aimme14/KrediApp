import type { PrestamoItem, ClienteItem, PeriodoAdminListaItem } from "@/lib/empresa-api";
import { formatClienteCodigoRutaYNumero } from "@/lib/empresa-api";
import type { PrestamoFiltroEstado, PrestamoFiltroContable } from "@/lib/prestamo-periodo-filter";
import { numeroPeriodoAdmin } from "@/lib/prestamo-periodo-filter";
import { filtrarPrestamosParaListado } from "@/lib/prestamo-list-filter";
import { labelEstadoPrestamo } from "@/lib/prestamo-estado";

export type ExportPrestamosParams = {
  prestamos: PrestamoItem[];
  prestamosPagados: PrestamoItem[];
  prestamosCastigados: PrestamoItem[];
  filtroContable: PrestamoFiltroContable;
  filtroEstado: PrestamoFiltroEstado;
  filtroRutaId: string;
  filtroNombre?: string;
  clientePorId: Record<string, ClienteItem>;
  periodos: PeriodoAdminListaItem[];
  rutas: { id: string; nombre: string }[];
  nombreEmpresa: string;
};

function cop(n: number | undefined): number {
  return Math.round((n ?? 0) * 100) / 100;
}

function labelPeriodo(filtro: PrestamoFiltroContable, periodos: PeriodoAdminListaItem[]): string {
  if (filtro.modo === "hoy") return "Hoy";
  if (filtro.modo === "todo") return "Todo el historial";
  if (filtro.modo === "actual") {
    const abierto = periodos.find((p) => p.estado === "abierto");
    const num = abierto ? numeroPeriodoAdmin(abierto.id, periodos) : null;
    return `Período actual${num ? ` #${num}` : ""}`;
  }
  if (filtro.modo === "cerrado" && filtro.periodoId) {
    const num = numeroPeriodoAdmin(filtro.periodoId, periodos);
    return `Período cerrado${num ? ` #${num}` : ""}`;
  }
  return "—";
}

export function contarParaPreview(
  params: Omit<ExportPrestamosParams, "nombreEmpresa" | "rutas">
): { cantidad: number; totalPrestado: number } {
  const lista = filtrarPrestamosParaListado(params);
  return {
    cantidad: lista.length,
    totalPrestado: lista.reduce((s, p) => s + (p.monto ?? 0), 0),
  };
}

export async function generarExcelPrestamos(params: ExportPrestamosParams): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;

  const {
    filtroContable,
    filtroEstado,
    filtroRutaId,
    clientePorId,
    periodos,
    rutas,
    nombreEmpresa,
  } = params;

  const lista = filtrarPrestamosParaListado(params);
  const rutaMap = new Map(rutas.map((r) => [r.id, r.nombre]));
  const rutaNombre = filtroRutaId
    ? (rutaMap.get(filtroRutaId) ?? filtroRutaId)
    : "Todas las rutas";
  const estadoLabel: Record<string, string> = {
    todos: "Todos",
    activo: "Activos",
    pagado: "Pagados",
    castigado: "Pérdidas",
    moroso: "Morosos",
  };
  const periodoLabel = labelPeriodo(filtroContable, periodos);
  const fechaExport = new Date().toLocaleDateString("es-CO", { dateStyle: "long" });

  const wb = new ExcelJS.Workbook();
  wb.creator = "KrediApp";
  wb.created = new Date();

  const ws = wb.addWorksheet("Préstamos", {
    views: [{ state: "frozen", ySplit: 7 }],
  });

  const COLS = 16;
  const merge = (row: number) => ws.mergeCells(row, 1, row, COLS);

  merge(1);
  const t = ws.getCell(1, 1);
  t.value = nombreEmpresa;
  t.font = { bold: true, size: 14 };

  merge(2);
  const s1 = ws.getCell(2, 1);
  s1.value = `Reporte de préstamos — ${periodoLabel}`;
  s1.font = { bold: true, size: 11 };

  merge(3);
  const s2 = ws.getCell(3, 1);
  s2.value = `Estado: ${estadoLabel[filtroEstado] ?? filtroEstado}  ·  Ruta: ${rutaNombre}`;
  s2.font = { size: 10, color: { argb: "FF666666" } };

  merge(4);
  const s3 = ws.getCell(4, 1);
  s3.value = `Generado: ${fechaExport}  ·  ${lista.length} préstamo${lista.length !== 1 ? "s" : ""}`;
  s3.font = { size: 10, color: { argb: "FF666666" } };

  ws.addRow([]);
  ws.addRow([]);

  const HEADERS = [
    "Código",
    "Cliente",
    "Cédula",
    "Ruta",
    "Estado",
    "Fecha",
    "Monto prestado",
    "Interés %",
    "Total a pagar",
    "Saldo pendiente",
    "Cobrado",
    "Capital perdido",
    "Cuotas pagadas",
    "Total cuotas",
    "Modalidad",
    "Fecha pago/pérdida",
  ];

  const filaH = ws.addRow(HEADERS);
  filaH.height = 22;
  filaH.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF334155" } } };
  });

  ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: COLS } };

  const ordenados = [...lista].sort((a, b) => {
    const ta = new Date(a.fechaInicio || 0).getTime();
    const tb = new Date(b.fechaInicio || 0).getTime();
    return tb - ta;
  });

  ordenados.forEach((p, idx) => {
    const cl = clientePorId[p.clienteId];
    const rutaIdReal = p.rutaId || cl?.rutaId || "";
    const cuotasPagadas =
      p.totalAPagar > 0 && p.numeroCuotas > 0
        ? Math.min(
            p.numeroCuotas,
            Math.round(((p.totalAPagar - p.saldoPendiente) / p.totalAPagar) * p.numeroCuotas)
          )
        : 0;
    const fechaRelevante =
      (p.estado === "pagado" || p.estado === "castigado") && p.fechaCierre
        ? new Date(p.fechaCierre)
        : p.fechaInicio
          ? new Date(p.fechaInicio)
          : null;
    const fechaCierreDate = p.fechaCierre ? new Date(p.fechaCierre) : null;

    const fila = ws.addRow([
      cl?.codigo ? formatClienteCodigoRutaYNumero(cl.codigo) : "—",
      cl?.nombre ?? "—",
      cl?.cedula ?? "—",
      rutaMap.get(rutaIdReal) ?? (rutaIdReal || "—"),
      labelEstadoPrestamo(p),
      fechaRelevante,
      cop(p.monto),
      (p.interes ?? 0) / 100,
      cop(p.totalAPagar),
      cop(p.saldoPendiente),
      cop(p.cobradoAcumulado),
      cop(p.totalCastigado),
      cuotasPagadas,
      p.numeroCuotas,
      p.modalidad ? p.modalidad.charAt(0).toUpperCase() + p.modalidad.slice(1) : "—",
      fechaCierreDate,
    ]);

    fila.getCell(6).numFmt = "dd/mm/yyyy";
    fila.getCell(7).numFmt = "#,##0";
    fila.getCell(8).numFmt = '0.00"%"';
    fila.getCell(9).numFmt = "#,##0";
    fila.getCell(10).numFmt = "#,##0";
    fila.getCell(11).numFmt = "#,##0";
    fila.getCell(12).numFmt = "#,##0";
    fila.getCell(16).numFmt = "dd/mm/yyyy";

    if (idx % 2 === 0) {
      fila.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }

    const estadoCell = fila.getCell(5);
    if (p.estado === "castigado") {
      estadoCell.font = { color: { argb: "FFDC2626" }, bold: true };
    } else if (p.estado === "pagado") {
      estadoCell.font = { color: { argb: "FF16A34A" }, bold: true };
    }
  });

  ws.addRow([]);
  const filaT = ws.addRow([
    "",
    "",
    "",
    "",
    "TOTALES",
    "",
    lista.reduce((s, p) => s + cop(p.monto), 0),
    "",
    lista.reduce((s, p) => s + cop(p.totalAPagar), 0),
    lista.reduce((s, p) => s + cop(p.saldoPendiente), 0),
    lista.reduce((s, p) => s + cop(p.cobradoAcumulado), 0),
    lista.reduce((s, p) => s + cop(p.totalCastigado), 0),
    "",
    "",
    "",
    "",
  ]);
  filaT.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  [7, 9, 10, 11, 12].forEach((col) => {
    filaT.getCell(col).numFmt = "#,##0";
  });

  ws.columns = [
    { width: 10 },
    { width: 26 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 13 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prestamos_${periodoLabel.toLowerCase().replace(/[\s#]+/g, "_")}_${Date.now()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
