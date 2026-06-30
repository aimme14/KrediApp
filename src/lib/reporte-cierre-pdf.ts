import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { CierreDiaSnapshot, DiaPeriodoSnapshot } from "@/lib/cierre-dia-snapshot";
import { formatFechaDia } from "@/lib/colombia-day-bounds";
import { formatoCuotasRestanteTotal } from "@/lib/cuotas-display";

/**
 * Helvetica (StandardFonts) usa WinAnsi: falla con espacios tipográficos de `toLocaleString`
 * (p. ej. U+202F) o con emoji. Normaliza a texto seguro para pdf-lib.
 */
function sanitizarTextoPdf(s: string): string {
  let o = s;
  o = o.replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, " ");
  o = o.replace(/[\u2010-\u2015\u2212]/g, "-");
  o = o.replace(/[«»]/g, '"');
  o = o.replace(/…/g, "...");
  const out: string[] = [];
  for (const ch of o) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) out.push(ch);
    else out.push("?");
  }
  return out.join("");
}

function fmtMoney(n: number): string {
  const hasDecimals = Math.round(n * 100) % 100 !== 0;
  const raw = n.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return sanitizarTextoPdf(`$ ${raw}`);
}

function trunc(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function normalizarMetodoPagoPdf(metodo: string | null | undefined): "efectivo" | "transferencia" | "otro" {
  const m = (metodo ?? "").trim().toLowerCase();
  if (!m) return "otro";
  if (m.includes("efectivo")) return "efectivo";
  if (m.includes("transfer")) return "transferencia";
  return "otro";
}

/** Días del período para resumen y detalle del PDF; fallback de un día si no hay desglose. */
function getDiasParaReporte(snapshot: CierreDiaSnapshot): DiaPeriodoSnapshot[] {
  if (snapshot.diasDelPeriodo.length > 0) {
    return snapshot.diasDelPeriodo;
  }
  return [
    {
      fechaDia: snapshot.fechaDia,
      cobros: snapshot.cobros,
      noPagos: snapshot.noPagos,
      perdidasDelDia: snapshot.perdidasDelDia,
      gastosDelDia: snapshot.gastosDelDia,
      prestamosDesembolsoDelDia: snapshot.prestamosDesembolsoDelDia ?? [],
      totalCobrosEfectivo: snapshot.totalCobrosEfectivoDia,
      totalCobrosTransferencia: snapshot.totalCobrosLista - snapshot.totalCobrosEfectivoDia,
      totalGastos: snapshot.totalGastosDia,
      totalCobros: snapshot.totalCobrosLista,
    },
  ];
}

function formatHoraPdf(fecha: string | null): string {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export type ReporteCierrePdfMeta = {
  rutaNombre: string;
  empleadoNombre: string;
  montoEntregado: number;
  comentarioTrabajador: string | null;
  rutaCapitalTotal: number;
  rutaInversiones: number;
  rutaGanancias: number;
  aprobadoEn: Date;
  totalCobrosEfectivoDia: number;
};

const PAGE_W = 595;
const PAGE_H = 842;
const M = 48;

/** Azul barra de sección (como mock) */
const NAV = rgb(0.1, 0.26, 0.52);
const NAV_LIGHT = rgb(0.18, 0.42, 0.72);
const WHITE = rgb(1, 1, 1);

const COL = {
  text: rgb(0.11, 0.13, 0.17),
  muted: rgb(0.42, 0.44, 0.48),
  accentDark: rgb(0.1, 0.22, 0.4),
  band: rgb(0.93, 0.94, 0.96),
  rule: rgb(0.78, 0.81, 0.86),
  highlight: rgb(0.94, 0.97, 0.95),
  footer: rgb(0.5, 0.52, 0.55),
  tableHead: rgb(0.22, 0.24, 0.28),
  metaBg: rgb(0.96, 0.97, 0.98),
};

const TB = { fs: 7.5, hdr: 8, lh: 10.5 };
/** Hueco horizontal entre columnas adyacentes (evita “CuotasMétodo”, etc.). */
const COL_GAP = 5;
/** Padding interior izquierdo/derecho dentro de cada celda (pt). */
const CELL_PAD_X = 2;
/** Altura del header de cada sección encuadrada (pt). */
const BOX_HDR_H = 17;

/** Ancho útil entre márgenes interiores del PDF (líneas y tablas alineadas). */
function tableInnerBounds() {
  const inset = 4;
  const x0 = M + inset;
  const w = PAGE_W - 2 * M - 2 * inset;
  return { x0, w, inset };
}

export async function buildReporteCierrePdf(
  snapshot: CierreDiaSnapshot,
  meta: ReporteCierrePdfMeta
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const FS = {
    title: 17,
    body: 9,
    small: 7.5,
    section: 10,
    meta: 8.5,
    metaLbl: 7,
  };

  const LH = { body: 11.5, tight: 10 };

  const cajaEfectivo =
    snapshot.totalCobrosEfectivoDia +
    snapshot.totalBaseAsignadaDia -
    snapshot.totalGastosDia -
    (snapshot.totalPrestamosDesembolsoDia ?? 0);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M;
  };

  const ensureBottom = (need: number) => {
    if (y < M + need) newPage();
  };

  const line = (
    t: string,
    opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; dy?: number }
  ) => {
    ensureBottom(16);
    const sz = opts?.size ?? FS.body;
    const f = opts?.bold ? fontBold : font;
    const c = opts?.color ?? COL.text;
    const extra = opts?.dy ?? 0;
    if (extra) y -= extra;
    page.drawText(sanitizarTextoPdf(t), { x: M, y, size: sz, font: f, color: c });
    y -= LH.body;
  };

  const spacer = (pts = 6) => {
    y -= pts;
    ensureBottom(20);
  };

  const hr = () => {
    ensureBottom(12);
    y -= 4;
    page.drawLine({
      start: { x: M, y },
      end: { x: PAGE_W - M, y },
      thickness: 0.5,
      color: COL.rule,
    });
    y -= 10;
  };

  type CellOpts = {
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    size?: number;
    align?: "left" | "right" | "center";
    /** Sin truncar (p. ej. hora larga si cabe en columna ancha). */
    noTrunc?: boolean;
  };

  const drawCell = (text: string, x: number, yy: number, w: number, opts?: CellOpts) => {
    const sz = opts?.size ?? TB.fs;
    const f = opts?.bold ? fontBold : font;
    const c = opts?.color ?? COL.text;
    const innerW = Math.max(8, w - 2 * CELL_PAD_X);
    const px = x + CELL_PAD_X;
    let t2 = sanitizarTextoPdf(text);
    if (!opts?.noTrunc) {
      const maxCh = Math.max(6, Math.floor(innerW / (sz * 0.45)));
      t2 = trunc(t2, maxCh);
    }
    const align = opts?.align ?? "left";
    if (align === "right") {
      let tw = f.widthOfTextAtSize(t2, sz);
      while (tw > innerW && t2.length > 1) {
        t2 = `${t2.slice(0, -2)}…`;
        tw = f.widthOfTextAtSize(t2, sz);
      }
      const drawX = Math.max(px, px + innerW - tw);
      page.drawText(t2, { x: drawX, y: yy, size: sz, font: f, color: c });
    } else if (align === "center") {
      let tw = f.widthOfTextAtSize(t2, sz);
      while (tw > innerW && t2.length > 1) {
        t2 = `${t2.slice(0, -2)}…`;
        tw = f.widthOfTextAtSize(t2, sz);
      }
      const drawX = px + (innerW - tw) / 2;
      page.drawText(t2, { x: drawX, y: yy, size: sz, font: f, color: c });
    } else {
      page.drawText(t2, { x: px, y: yy, size: sz, font: f, color: c, maxWidth: innerW });
    }
  };

  type TableCell = { text: string; x: number; w: number } & CellOpts;

  const tableRow = (cells: TableCell[], yy: number) => {
    for (const c of cells) {
      drawCell(c.text, c.x, yy, c.w, {
        bold: c.bold,
        color: c.color,
        size: c.size,
        align: c.align,
        noTrunc: c.noTrunc,
      });
    }
  };

  /** Barra azul; `cursorY` es la posición vertical actual (misma convención que el resto del PDF). */
  const sectionBarDark = (title: string, x: number, width: number, cursorY: number): number => {
    const barH = 18;
    ensureBottom(barH + 24);
    const yRect = cursorY - barH + 2;
    page.drawRectangle({
      x,
      y: yRect,
      width,
      height: barH,
      color: NAV,
      borderColor: NAV,
      borderWidth: 0.3,
    });
    page.drawText(sanitizarTextoPdf(title), {
      x: x + 8,
      y: yRect + 5,
      size: FS.section,
      font: fontBold,
      color: WHITE,
    });
    return yRect - 8;
  };

  const advanceY = (delta: number) => {
    y -= delta;
    ensureBottom(24);
  };

  const { x0: tblEdge, w: tblW } = tableInnerBounds();

  /** Línea sobre la fila de totales: pegada al contenido, más fina y neutra. */
  const hrTable = () => {
    const lift = 7;
    page.drawLine({
      start: { x: tblEdge, y: y + lift },
      end: { x: tblEdge + tblW, y: y + lift },
      thickness: 0.35,
      color: COL.rule,
    });
    y -= 6;
  };

  /**
   * Dibuja una sección encuadrada: header relleno (COL.metaBg) + borde exterior al final.
   * El borde se traza SIN fill sobre el contenido ya renderizado — pdf-lib layering.
   * Si drawContent provoca un salto de página, el borde sólo aparece en la página inicial.
   */
  const withBox = (
    title: string,
    subtotal: string | null,
    drawContent: () => void
  ): void => {
    ensureBottom(BOX_HDR_H + 40);
    const yBoxTop = y;
    const boxX = M;
    const boxW = PAGE_W - 2 * M;
    const startPage = page;

    // Header con fondo
    page.drawRectangle({ x: boxX, y: yBoxTop - BOX_HDR_H, width: boxW, height: BOX_HDR_H, color: COL.metaBg });
    // Línea inferior del header
    page.drawLine({
      start: { x: boxX, y: yBoxTop - BOX_HDR_H },
      end:   { x: boxX + boxW, y: yBoxTop - BOX_HDR_H },
      thickness: 0.4, color: COL.rule,
    });
    // Título
    page.drawText(sanitizarTextoPdf(title), {
      x: boxX + 8, y: yBoxTop - BOX_HDR_H + 5,
      size: FS.meta, font: fontBold, color: COL.accentDark,
    });
    // Subtotal (alineado a la derecha)
    if (subtotal) {
      const st = sanitizarTextoPdf(subtotal);
      const stW = font.widthOfTextAtSize(st, TB.fs);
      page.drawText(st, {
        x: boxX + boxW - 8 - stW, y: yBoxTop - BOX_HDR_H + 5,
        size: TB.fs, font, color: COL.muted,
      });
    }

    y = yBoxTop - BOX_HDR_H - 7; // padding superior del cuerpo
    drawContent();
    y -= 6; // padding inferior del cuerpo

    // Borde exterior (stroke-only, sin fill — el contenido ya está en el PDF)
    if (page === startPage) {
      page.drawRectangle({
        x: boxX, y, width: boxW, height: yBoxTop - y,
        borderColor: COL.rule, borderWidth: 0.5,
      });
    }
    y -= 8; // margen tras el cuadro
  };

  // ——— Título (solo texto, sin recuadro — ahorra espacio vertical) ———
  const titleText = "Reporte del Día";
  const titleW = fontBold.widthOfTextAtSize(sanitizarTextoPdf(titleText), FS.title);
  const titleX = (PAGE_W - titleW) / 2;
  page.drawText(sanitizarTextoPdf(titleText), {
    x: titleX,
    y,
    size: FS.title,
    font: fontBold,
    color: NAV,
  });
  y -= 22;
  spacer(4);

  // ——— Metadatos: 4 columnas (etiqueta + valor) ———
  {
    const innerW = PAGE_W - 2 * M;
    const cw = innerW / 4;
    const aprobStr = meta.aprobadoEn.toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const cols: { lbl: string; val: string }[] = [
      { lbl: "Fecha", val: snapshot.fechaDia },
      { lbl: "Ruta", val: trunc(meta.rutaNombre, 28) },
      { lbl: "Trabajador", val: trunc(meta.empleadoNombre, 28) },
      { lbl: "Aprobado", val: trunc(aprobStr, 36) },
    ];
    const boxH = 38;
    ensureBottom(boxH + 8);
    const yBottom = y - boxH + 4;
    page.drawRectangle({
      x: M,
      y: yBottom,
      width: innerW,
      height: boxH,
      color: WHITE,
      borderColor: COL.rule,
      borderWidth: 0.6,
    });
    let cx = M + 8;
    for (let i = 0; i < 4; i++) {
      const col = cols[i];
      page.drawText(sanitizarTextoPdf(col.lbl), {
        x: cx,
        y: yBottom + boxH - 12,
        size: FS.metaLbl,
        font,
        color: COL.muted,
      });
      page.drawText(sanitizarTextoPdf(col.val), {
        x: cx,
        y: yBottom + boxH - 26,
        size: FS.meta,
        font: fontBold,
        color: COL.text,
      });
      cx += cw;
    }
    y = yBottom - 10;
  }

  spacer(6);

  // ——— Monto (izq azul) + contexto (der gris) ———
  {
    const gap = 12;
    const mid = PAGE_W / 2;
    const leftX = M;
    const leftW = mid - gap / 2 - M;
    const rightX = mid + gap / 2;
    const rightW = PAGE_W - M - rightX;
    const pad = 10;
    const comRaw = meta.comentarioTrabajador?.trim() ? trunc(meta.comentarioTrabajador.trim(), 280) : "—";
    const rightTxt = sanitizarTextoPdf(
      `Base asignada: ${fmtMoney(snapshot.totalBaseAsignadaDia)} · Préstamos desde caja: ${fmtMoney(snapshot.totalPrestamosDesembolsoDia ?? 0)} · Nota del trabajador: ${comRaw}`
    );
    const rightLines = wrapPdfLines(rightTxt, font, FS.small, rightW - pad * 2);
    const lineH = LH.tight;
    const leftH = pad * 2 + lineH * 2 + 6;
    const rightH = pad * 2 + rightLines.length * lineH + 4;
    const boxH = Math.max(leftH, rightH);

    ensureBottom(boxH + 16);
    const yBottom = y - boxH + 4;

    page.drawRectangle({
      x: leftX,
      y: yBottom,
      width: leftW,
      height: boxH,
      color: NAV_LIGHT,
      borderColor: NAV,
      borderWidth: 0.5,
    });
    let ly = yBottom + boxH - pad - 4;
    page.drawText(sanitizarTextoPdf("A entregar en efectivo"), {
      x: leftX + pad,
      y: ly,
      size: FS.meta,
      font,
      color: WHITE,
    });
    ly -= lineH + 2;
    page.drawText(fmtMoney(cajaEfectivo), {
      x: leftX + pad,
      y: ly,
      size: FS.section + 1,
      font: fontBold,
      color: WHITE,
    });

    page.drawRectangle({
      x: rightX,
      y: yBottom,
      width: rightW,
      height: boxH,
      color: COL.band,
      borderColor: COL.rule,
      borderWidth: 0.5,
    });
    let ry = yBottom + boxH - pad - 4;
    for (const ln of rightLines) {
      page.drawText(ln, {
        x: rightX + pad,
        y: ry,
        size: FS.small,
        font,
        color: COL.text,
      });
      ry -= lineH;
    }

    y = yBottom - 10;
  }

  spacer(8);

  // ——— Resumen por día: una fila de 6 métricas por cada fecha del período ———
  {
    const diasResumen = getDiasParaReporte(snapshot);

    const unicoDia = diasResumen.length === 1;
    const innerW = PAGE_W - 2 * M - 16;
    const x0 = M + 8;
    const nCol = 6;
    const colW = innerW / nCol;
    const padTop = 11;
    const padBottom = 11;
    const gapLabelValor = 10;
    const valBand = 18;
    const labelBand = 10;
    const blockH = padTop + labelBand + gapLabelValor + valBand + padBottom;
    const labels = [
      "Cobros efectivo",
      "Cobros transferencia",
      "A entregar (efectivo)",
      "Clientes pagaron",
      "Clientes no pagaron",
      "Gastos del día",
    ];

    for (let d = 0; d < diasResumen.length; d++) {
      const dia = diasResumen[d];
      const cajaDia = unicoDia
        ? cajaEfectivo
        : Math.round((dia.totalCobrosEfectivo - dia.totalGastos) * 100) / 100;
      const vals = [
        fmtMoney(dia.totalCobrosEfectivo),
        fmtMoney(dia.totalCobrosTransferencia),
        fmtMoney(cajaDia),
        String(dia.cobros.length),
        String(dia.noPagos.length),
        fmtMoney(dia.totalGastos),
      ];
      const tituloResumen = sanitizarTextoPdf(
        `Resumen - ${formatFechaDia(dia.fechaDia) || dia.fechaDia}`
      );

      y = sectionBarDark(tituloResumen, M, PAGE_W - 2 * M, y);

      ensureBottom(blockH + 16);
      const blockBottom = y - blockH + 2;
      page.drawRectangle({
        x: M + 4,
        y: blockBottom,
        width: PAGE_W - 2 * M - 8,
        height: blockH,
        color: COL.metaBg,
        borderColor: COL.rule,
        borderWidth: 0.45,
      });

      const yTopInner = blockBottom + blockH;
      const yLabelRow = yTopInner - padTop - 1;
      const yValRow = blockBottom + padBottom + 6;
      let cx = x0;
      for (let i = 0; i < nCol; i++) {
        const isCaja = i === 2;
        drawCell(labels[i], cx, yLabelRow, colW, {
          size: FS.metaLbl,
          color: COL.muted,
          align: "center",
        });
        if (isCaja) {
          page.drawRectangle({
            x: cx + 3,
            y: blockBottom + padBottom - 1,
            width: colW - 6,
            height: valBand + 2,
            color: rgb(0.88, 0.93, 0.98),
            borderColor: NAV_LIGHT,
            borderWidth: 0.35,
          });
        }
        drawCell(vals[i], cx, yValRow, colW, {
          size: isCaja ? FS.section : FS.meta,
          bold: true,
          color: isCaja ? NAV : COL.text,
          align: "center",
        });
        cx += colW;
      }

      y = blockBottom - 10;
      if (d < diasResumen.length - 1) spacer(8);
    }
  }

  spacer(10);

  // ——— Detalle por día (más reciente primero) ———
  {
    const diasDetalle = [...getDiasParaReporte(snapshot)].sort((a, b) =>
      b.fechaDia.localeCompare(a.fechaDia)
    );


    const innerPad = 2;
    const x0Tbl = tblEdge + innerPad;
    const sumW = tblW - 2 * innerPad;

    const gapsCobrosEf = 5 * COL_GAP;
    const wHr = 70;
    const wCuo = 38;
    const wDeb = 50;
    const wTP = 58;
    const wCob = 56;
    const wCli = sumW - (wHr + wCuo + wDeb + wTP + wCob + gapsCobrosEf);

    const xCliEf = x0Tbl;
    const xCobEf = xCliEf + wCli + COL_GAP;
    const xTPEf = xCobEf + wCob + COL_GAP;
    const xDebEf = xTPEf + wTP + COL_GAP;
    const xCuoEf = xDebEf + wDeb + COL_GAP;
    const xHrEf = xCuoEf + wCuo + COL_GAP;

    const cuoShareCli = wCuo * (wCli / (wCli + wDeb));
    const cuoShareDeb = wCuo - cuoShareCli;
    const wCliTr = wCli + cuoShareCli;
    const wDebTr = wDeb + cuoShareDeb;
    const gapsCobrosTr = 4 * COL_GAP;

    const xCliTr = x0Tbl;
    const xCobTr = xCliTr + wCliTr + COL_GAP;
    const xTPTr = xCobTr + wCob + COL_GAP;
    const xDebTr = xTPTr + wTP + COL_GAP;
    const xHrTr = xDebTr + wDebTr + COL_GAP;

    const gapsCobrosOt = 3 * COL_GAP;
    const wMetOt = 66;
    const wHrOt = wHr;
    const wCobOt = wCob;
    const wCliOt = sumW - (wHrOt + wMetOt + wCobOt + gapsCobrosOt);

    const xCliOt = x0Tbl;
    const xCobOt = xCliOt + wCliOt + COL_GAP;
    const xMetOt = xCobOt + wCobOt + COL_GAP;
    const xHrOt = xMetOt + wMetOt + COL_GAP;

    const gapsPrest = 3 * COL_GAP;
    const wHrPr = Math.max(68, Math.floor((sumW - gapsPrest) * 0.28));
    const uPr = sumW - gapsPrest - wHrPr;
    const wCapPr = Math.floor(uPr * 0.28);
    const wTotPr = Math.floor(uPr * 0.28);
    const wCliPr = uPr - wCapPr - wTotPr;

    const xCliPr = x0Tbl;
    const xCapPr = xCliPr + wCliPr + COL_GAP;
    const xTotPr = xCapPr + wCapPr + COL_GAP;
    const xHrPr = xTotPr + wTotPr + COL_GAP;

    const gapsNp = 4 * COL_GAP;
    const innerSumNp = sumW - gapsNp;
    const wCliNp = Math.max(36, Math.floor(innerSumNp * 0.22));
    const wMotNp = Math.max(36, Math.floor(innerSumNp * 0.22));
    const wCuoNp = Math.max(26, Math.floor(innerSumNp * 0.1));
    const wDebNp = Math.max(42, Math.floor(innerSumNp * 0.23));
    const wTPNp = innerSumNp - wCliNp - wMotNp - wCuoNp - wDebNp;
    const wTotEtiquetaNp = wCliNp + wMotNp + wCuoNp + 3 * COL_GAP;

    const xCliNp = x0Tbl;
    const xMotNp = xCliNp + wCliNp + COL_GAP;
    const xCuoNp = xMotNp + wMotNp + COL_GAP;
    const xDebNp = xCuoNp + wCuoNp + COL_GAP;
    const xTPNp = xDebNp + wDebNp + COL_GAP;

    const gapsG = 2 * COL_GAP;
    const wMontoG = 58;
    const wMotG = 66;
    const wDescG = Math.max(24, sumW - wMontoG - wMotG - gapsG);
    const xGm = x0Tbl;
    const xGt = xGm + wMontoG + COL_GAP;
    const xGd = xGt + wMotG + COL_GAP;

    const gapsPerd = 2 * COL_GAP;
    const wMontoPerd = 58;
    const wMotPerd = 80;
    const wCliPerd = Math.max(24, sumW - wMontoPerd - wMotPerd - gapsPerd);
    const xCliPerd = x0Tbl;
    const xMotPerd = xCliPerd + wCliPerd + COL_GAP;
    const xMonPerd = xMotPerd + wMotPerd + COL_GAP;

    const drawCobrosHeaderEfectivo = () => {
      ensureBottom(TB.lh + 8);
      tableRow(
        [
          { text: "Cliente", x: xCliEf, w: wCli, bold: true, color: COL.tableHead },
          { text: "Cobro", x: xCobEf, w: wCob, bold: true, color: COL.tableHead, align: "right" },
          {
            text: "Tot. préstamo",
            x: xTPEf,
            w: wTP,
            bold: true,
            color: COL.tableHead,
            align: "right",
          },
          { text: "Debe", x: xDebEf, w: wDeb, bold: true, color: COL.tableHead, align: "right" },
          { text: "Cuotas", x: xCuoEf, w: wCuo, bold: true, color: COL.tableHead, align: "right" },
          { text: "Hora", x: xHrEf, w: wHr, bold: true, color: COL.tableHead },
        ],
        y
      );
      advanceY(TB.lh + 4);
    };

    const drawCobrosHeaderTransferencia = () => {
      ensureBottom(TB.lh + 8);
      tableRow(
        [
          { text: "Cliente", x: xCliTr, w: wCliTr, bold: true, color: COL.tableHead },
          { text: "Cobro", x: xCobTr, w: wCob, bold: true, color: COL.tableHead, align: "right" },
          {
            text: "Tot. préstamo",
            x: xTPTr,
            w: wTP,
            bold: true,
            color: COL.tableHead,
            align: "right",
          },
          { text: "Debe", x: xDebTr, w: wDebTr, bold: true, color: COL.tableHead, align: "right" },
          { text: "Hora", x: xHrTr, w: wHr, bold: true, color: COL.tableHead },
        ],
        y
      );
      advanceY(TB.lh + 4);
    };

    const drawCobrosHeaderOtros = () => {
      ensureBottom(TB.lh + 8);
      tableRow(
        [
          { text: "Cliente", x: xCliOt, w: wCliOt, bold: true, color: COL.tableHead },
          { text: "Cobro", x: xCobOt, w: wCobOt, bold: true, color: COL.tableHead, align: "right" },
          { text: "Método", x: xMetOt, w: wMetOt, bold: true, color: COL.tableHead },
          { text: "Hora", x: xHrOt, w: wHrOt, bold: true, color: COL.tableHead },
        ],
        y
      );
      advanceY(TB.lh + 4);
    };

    const renderPrestamos = (rows: DiaPeriodoSnapshot["prestamosDesembolsoDelDia"]) => {
      const sumCap = rows.reduce((s, p) => s + p.monto, 0);
      withBox(
        "Préstamos desembolsados",
        rows.length > 0 ? `Capital: ${fmtMoney(sumCap)}` : null,
        () => {
          if (rows.length === 0) {
            page.drawText(sanitizarTextoPdf("Sin movimientos este día."), {
              x: M + 8, y, size: FS.meta, font, color: COL.muted,
            });
            y -= TB.lh;
            return;
          }
          tableRow([
            { text: "Cliente", x: xCliPr, w: wCliPr, bold: true, color: COL.tableHead },
            { text: "Capital entregado", x: xCapPr, w: wCapPr, bold: true, color: COL.tableHead, align: "right" },
            { text: "Total a pagar", x: xTotPr, w: wTotPr, bold: true, color: COL.tableHead, align: "right" },
            { text: "Hora", x: xHrPr, w: wHrPr, bold: true, color: COL.tableHead },
          ], y);
          advanceY(TB.lh + 4);
          for (const p of rows) {
            ensureBottom(TB.lh + 6);
            tableRow([
              { text: trunc(p.clienteNombre, 36), x: xCliPr, w: wCliPr },
              { text: fmtMoney(p.monto), x: xCapPr, w: wCapPr, align: "right" },
              { text: fmtMoney(p.totalAPagar), x: xTotPr, w: wTotPr, align: "right" },
              { text: formatHoraPdf(p.fecha), x: xHrPr, w: wHrPr, noTrunc: true },
            ], y);
            advanceY(TB.lh);
          }
          hrTable();
          tableRow([
            { text: "Subtotal capital", x: xCliPr, w: wCliPr, bold: true },
            { text: fmtMoney(sumCap), x: xCapPr, w: wCapPr, bold: true, align: "right" },
            { text: "", x: xTotPr, w: wTotPr },
            { text: "", x: xHrPr, w: wHrPr },
          ], y);
          y -= TB.lh;
        }
      );
    };

    const renderCobrosEfectivo = (cobros: DiaPeriodoSnapshot["cobros"]) => {
      const rows = cobros.filter((c) => normalizarMetodoPagoPdf(c.metodoPago) === "efectivo");
      const sum = rows.reduce((s, c) => s + c.monto, 0);
      withBox(
        "Cobros — Efectivo",
        rows.length > 0 ? `Total: ${fmtMoney(sum)}` : null,
        () => {
          if (rows.length === 0) {
            page.drawText(sanitizarTextoPdf("Sin cobros en efectivo este día."), {
              x: M + 8, y, size: FS.meta, font, color: COL.muted,
            });
            y -= TB.lh;
            return;
          }
          drawCobrosHeaderEfectivo();
          for (const c of rows) {
            const cuotasTxt = formatoCuotasRestanteTotal(c.cuotasFaltantes, c.numeroCuotas);
            ensureBottom(TB.lh + 6);
            tableRow([
              { text: trunc(c.clienteNombre, 42), x: xCliEf, w: wCli },
              { text: fmtMoney(c.monto), x: xCobEf, w: wCob, align: "right" },
              { text: fmtMoney(c.totalAPagar), x: xTPEf, w: wTP, align: "right" },
              { text: fmtMoney(c.saldoPendienteTrasPago), x: xDebEf, w: wDeb, align: "right" },
              { text: cuotasTxt, x: xCuoEf, w: wCuo, align: "right" },
              { text: formatHoraPdf(c.fecha), x: xHrEf, w: wHr, noTrunc: true },
            ], y);
            advanceY(TB.lh);
          }
          hrTable();
          tableRow([
            { text: "Subtotal efectivo", x: xCliEf, w: wCli, bold: true },
            { text: fmtMoney(sum), x: xCobEf, w: wCob, bold: true, align: "right" },
            { text: "", x: xTPEf, w: wTP },
            { text: "", x: xDebEf, w: wDeb },
            { text: "", x: xCuoEf, w: wCuo },
            { text: "", x: xHrEf, w: wHr },
          ], y);
          y -= TB.lh;
        }
      );
    };

    const renderCobrosTransferencia = (cobros: DiaPeriodoSnapshot["cobros"]) => {
      const rows = cobros.filter((c) => normalizarMetodoPagoPdf(c.metodoPago) === "transferencia");
      const sum = rows.reduce((s, c) => s + c.monto, 0);
      withBox(
        "Cobros — Transferencia",
        rows.length > 0 ? `Total: ${fmtMoney(sum)}` : null,
        () => {
          if (rows.length === 0) {
            page.drawText(sanitizarTextoPdf("Sin cobros por transferencia este día."), {
              x: M + 8, y, size: FS.meta, font, color: COL.muted,
            });
            y -= TB.lh;
            return;
          }
          drawCobrosHeaderTransferencia();
          for (const c of rows) {
            ensureBottom(TB.lh + 6);
            tableRow([
              { text: trunc(c.clienteNombre, 42), x: xCliTr, w: wCliTr },
              { text: fmtMoney(c.monto), x: xCobTr, w: wCob, align: "right" },
              { text: fmtMoney(c.totalAPagar), x: xTPTr, w: wTP, align: "right" },
              { text: fmtMoney(c.saldoPendienteTrasPago), x: xDebTr, w: wDebTr, align: "right" },
              { text: formatHoraPdf(c.fecha), x: xHrTr, w: wHr, noTrunc: true },
            ], y);
            advanceY(TB.lh);
          }
          hrTable();
          tableRow([
            { text: "Subtotal transferencia", x: xCliTr, w: wCliTr, bold: true },
            { text: fmtMoney(sum), x: xCobTr, w: wCob, bold: true, align: "right" },
            { text: "", x: xTPTr, w: wTP },
            { text: "", x: xDebTr, w: wDebTr },
            { text: "", x: xHrTr, w: wHr },
          ], y);
          y -= TB.lh;
        }
      );
    };

    const renderCobrosOtros = (cobros: DiaPeriodoSnapshot["cobros"]) => {
      const rows = cobros.filter((c) => normalizarMetodoPagoPdf(c.metodoPago) === "otro");
      if (rows.length === 0) return;
      const sum = rows.reduce((s, c) => s + c.monto, 0);
      withBox(
        "Cobros — Otros métodos",
        `Total: ${fmtMoney(sum)}`,
        () => {
          drawCobrosHeaderOtros();
          for (const c of rows) {
            ensureBottom(TB.lh + 6);
            tableRow([
              { text: trunc(c.clienteNombre, 42), x: xCliOt, w: wCliOt },
              { text: fmtMoney(c.monto), x: xCobOt, w: wCobOt, align: "right" },
              { text: trunc(c.metodoPago ?? "—", 18), x: xMetOt, w: wMetOt },
              { text: formatHoraPdf(c.fecha), x: xHrOt, w: wHrOt, noTrunc: true },
            ], y);
            advanceY(TB.lh);
          }
          hrTable();
          tableRow([
            { text: "Subtotal otros", x: xCliOt, w: wCliOt, bold: true },
            { text: fmtMoney(sum), x: xCobOt, w: wCobOt, bold: true, align: "right" },
            { text: "", x: xMetOt, w: wMetOt },
            { text: "", x: xHrOt, w: wHrOt },
          ], y);
          y -= TB.lh;
        }
      );
    };

    const renderNoPagos = (noPagos: DiaPeriodoSnapshot["noPagos"]) => {
      const sumDebe = noPagos.reduce((s, n) => s + n.saldoPendientePrestamoActual, 0);
      withBox(
        "No pagaron",
        noPagos.length > 0 ? `Saldo total: ${fmtMoney(sumDebe)}` : null,
        () => {
          if (noPagos.length === 0) {
            page.drawText(sanitizarTextoPdf("Todos los clientes pagaron este día."), {
              x: M + 8, y, size: FS.meta, font, color: COL.muted,
            });
            y -= TB.lh;
            return;
          }
          tableRow([
            { text: "Cliente", x: xCliNp, w: wCliNp, bold: true, color: COL.tableHead },
            { text: "Motivo", x: xMotNp, w: wMotNp, bold: true, color: COL.tableHead },
            { text: "Cuotas", x: xCuoNp, w: wCuoNp, bold: true, color: COL.tableHead, align: "right" },
            { text: "Debe", x: xDebNp, w: wDebNp, bold: true, color: COL.tableHead, align: "right" },
            { text: "Tot. préstamo", x: xTPNp, w: wTPNp, bold: true, color: COL.tableHead, align: "right" },
          ], y);
          advanceY(TB.lh + 4);
          for (const n of noPagos) {
            const cuotasNp = formatoCuotasRestanteTotal(n.cuotasPendientes, n.numeroCuotas);
            ensureBottom(TB.lh + 6);
            tableRow([
              { text: trunc(n.clienteNombre, 36), x: xCliNp, w: wCliNp },
              { text: trunc(n.motivoNoPago, 28), x: xMotNp, w: wMotNp },
              { text: cuotasNp, x: xCuoNp, w: wCuoNp, align: "right" },
              { text: fmtMoney(n.saldoPendientePrestamoActual), x: xDebNp, w: wDebNp, align: "right" },
              { text: fmtMoney(n.totalAPagar), x: xTPNp, w: wTPNp, align: "right" },
            ], y);
            advanceY(TB.lh);
          }
          hrTable();
          tableRow([
            { text: "Total saldo debe", x: xCliNp, w: wTotEtiquetaNp, bold: true },
            { text: fmtMoney(sumDebe), x: xDebNp, w: wDebNp, bold: true, align: "right" },
            { text: "", x: xTPNp, w: wTPNp },
          ], y);
          y -= TB.lh;
        }
      );
    };

    const renderGastos = (gastos: DiaPeriodoSnapshot["gastosDelDia"]) => {
      const sumG = gastos.reduce((s, g) => s + g.monto, 0);
      withBox(
        "Gastos",
        gastos.length > 0 ? `Total: ${fmtMoney(sumG)}` : null,
        () => {
          if (gastos.length === 0) {
            page.drawText(sanitizarTextoPdf("Sin gastos registrados."), {
              x: M + 8, y, size: FS.meta, font, color: COL.muted,
            });
            y -= TB.lh;
            return;
          }
          tableRow([
            { text: "Monto", x: xGm, w: wMontoG, bold: true, color: COL.tableHead, align: "right" },
            { text: "Motivo", x: xGt, w: wMotG, bold: true, color: COL.tableHead },
            { text: "Descripción", x: xGd, w: wDescG, bold: true, color: COL.tableHead },
          ], y);
          advanceY(TB.lh + 4);
          for (const g of gastos) {
            ensureBottom(TB.lh + 6);
            tableRow([
              { text: fmtMoney(g.monto), x: xGm, w: wMontoG, align: "right" },
              { text: trunc(g.motivo, 18), x: xGt, w: wMotG },
              { text: trunc(g.descripcion, 72), x: xGd, w: wDescG },
            ], y);
            advanceY(TB.lh);
          }
          hrTable();
          tableRow([
            { text: fmtMoney(sumG), x: xGm, w: wMontoG, bold: true, align: "right" },
            { text: "Total gastos", x: xGt, w: wMotG, bold: true },
            { text: "", x: xGd, w: wDescG },
          ], y);
          y -= TB.lh;
        }
      );
    };

    const renderPerdidas = (perdidas: DiaPeriodoSnapshot["perdidasDelDia"]) => {
      const sumP = perdidas.reduce((s, p) => s + p.monto, 0);
      withBox(
        "Pérdidas",
        perdidas.length > 0 ? `Total: ${fmtMoney(sumP)}` : null,
        () => {
          if (perdidas.length === 0) {
            page.drawText(sanitizarTextoPdf("Sin pérdidas registradas."), {
              x: M + 8, y, size: FS.meta, font, color: COL.muted,
            });
            y -= TB.lh;
            return;
          }
          tableRow([
            { text: "Cliente", x: xCliPerd, w: wCliPerd, bold: true, color: COL.tableHead },
            { text: "Motivo", x: xMotPerd, w: wMotPerd, bold: true, color: COL.tableHead },
            { text: "Monto", x: xMonPerd, w: wMontoPerd, bold: true, color: COL.tableHead, align: "right" },
          ], y);
          advanceY(TB.lh + 4);
          for (const p of perdidas) {
            ensureBottom(TB.lh + 6);
            tableRow([
              { text: trunc(p.clienteNombre, 36), x: xCliPerd, w: wCliPerd },
              { text: trunc(p.motivoPerdida ?? "—", 24), x: xMotPerd, w: wMotPerd },
              { text: fmtMoney(p.monto), x: xMonPerd, w: wMontoPerd, align: "right", color: rgb(0.8, 0.15, 0.15) },
            ], y);
            advanceY(TB.lh);
          }
          hrTable();
          tableRow([
            { text: "Total pérdidas", x: xCliPerd, w: wCliPerd + wMotPerd + COL_GAP, bold: true },
            { text: fmtMoney(sumP), x: xMonPerd, w: wMontoPerd, bold: true, align: "right", color: rgb(0.8, 0.15, 0.15) },
          ], y);
          y -= TB.lh;
        }
      );
    };

    const separadorEntreDias = () => {
      ensureBottom(14);
      y -= 4;
      page.drawLine({
        start: { x: M + 16, y },
        end: { x: PAGE_W - M - 16, y },
        thickness: 0.35,
        color: COL.rule,
      });
      y -= 12;
    };

    for (let di = 0; di < diasDetalle.length; di++) {
      const dia = diasDetalle[di];
      const tituloDetalle = sanitizarTextoPdf(
        `Detalle — ${formatFechaDia(dia.fechaDia) || dia.fechaDia}`
      );
      y = sectionBarDark(tituloDetalle, M, PAGE_W - 2 * M, y);

      renderPrestamos(dia.prestamosDesembolsoDelDia);
      renderCobrosEfectivo(dia.cobros);
      renderCobrosTransferencia(dia.cobros);
      renderCobrosOtros(dia.cobros);
      renderNoPagos(dia.noPagos);
      renderGastos(dia.gastosDelDia);
      renderPerdidas(dia.perdidasDelDia);

      if (di < diasDetalle.length - 1) {
        separadorEntreDias();
      }
    }
  }
  spacer(10);

  // ——— Cuadre de caja ———
  {
    y = sectionBarDark("Cuadre de caja", M, PAGE_W - 2 * M, y);

    const filas: { lbl: string; signo: string; val: number; esTotal?: boolean }[] = [
      { lbl: "Base asignada",            signo: "+", val: snapshot.totalBaseAsignadaDia },
      { lbl: "Cobros efectivo",          signo: "+", val: snapshot.totalCobrosEfectivoDia },
      { lbl: "Gastos",                   signo: "-", val: snapshot.totalGastosDia },
      { lbl: "Prestamos desembolsados",      signo: "-", val: snapshot.totalPrestamosDesembolsoDia ?? 0 },
      { lbl: "A entregar en efectivo",   signo: "=", val: cajaEfectivo, esTotal: true },
    ];

    const boxPad = 10;
    const rowH = TB.lh + 2;
    const sepH = 8;
    const boxH = boxPad * 2 + filas.length * rowH + sepH;
    ensureBottom(boxH + 16);
    const boxBottom = y - boxH + 2;

    page.drawRectangle({
      x: M + 4,
      y: boxBottom,
      width: PAGE_W - 2 * M - 8,
      height: boxH,
      color: COL.metaBg,
      borderColor: COL.rule,
      borderWidth: 0.45,
    });

    const wSigno = 14;
    const wValCuadre = 90;
    const xSigno = M + 16;
    const xLblCuadre = xSigno + wSigno + 4;
    const xValCuadre = PAGE_W - M - 16 - wValCuadre;

    let yCuadre = boxBottom + boxH - boxPad - 2;

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (f.esTotal) {
        page.drawLine({
          start: { x: xSigno, y: yCuadre + rowH - 2 },
          end:   { x: PAGE_W - M - 16, y: yCuadre + rowH - 2 },
          thickness: 0.4,
          color: COL.rule,
        });
        yCuadre -= 4;
        page.drawText(sanitizarTextoPdf(f.signo), {
          x: xSigno,
          y: yCuadre,
          size: TB.fs,
          font: fontBold,
          color: NAV,
        });
        drawCell(f.lbl, xLblCuadre, yCuadre, xValCuadre - xLblCuadre - 4, {
          bold: true,
          color: NAV,
          size: TB.fs,
        });
        drawCell(fmtMoney(f.val), xValCuadre, yCuadre, wValCuadre, {
          bold: true,
          color: NAV,
          align: "right",
          size: FS.meta,
        });
      } else {
        page.drawText(sanitizarTextoPdf(f.signo), {
          x: xSigno,
          y: yCuadre,
          size: TB.fs,
          font,
          color: COL.muted,
        });
        drawCell(f.lbl, xLblCuadre, yCuadre, xValCuadre - xLblCuadre - 4, {
          color: COL.text,
          size: TB.fs,
        });
        drawCell(fmtMoney(f.val), xValCuadre, yCuadre, wValCuadre, {
          color: COL.text,
          align: "right",
          size: TB.fs,
        });
      }
      yCuadre -= rowH;
    }

    y = boxBottom - 10;
  }

  hr();
  ensureBottom(28);
  page.drawText(sanitizarTextoPdf("Documento generado al aprobar la entrega. No modificar."), {
    x: M,
    y: M + 8,
    size: FS.small,
    font,
    color: COL.footer,
  });

  const bytes = await pdf.save();
  return bytes;
}

function wrapPdfLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(tryLine, size) <= maxW) {
      cur = tryLine;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
