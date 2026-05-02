import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { CierreDiaSnapshot } from "@/lib/cierre-dia-snapshot";
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

export type ReporteCierrePdfMeta = {
  rutaNombre: string;
  empleadoNombre: string;
  montoEntregado: number;
  comentarioTrabajador: string | null;
  aprobadoEn: Date;
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

const MAX_ROWS_DETALLE = 80;
/** Espacio vertical por fila de tabla (texto + respiro). */
const TB = { fs: 7.5, hdr: 8, lh: 10.5 };
/** Hueco horizontal entre columnas adyacentes (evita “CuotasMétodo”, etc.). */
const COL_GAP = 5;
/** Padding interior izquierdo/derecho dentro de cada celda (pt). */
const CELL_PAD_X = 2;

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

  let rowBudget = MAX_ROWS_DETALLE;

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
    page.drawText(sanitizarTextoPdf("Monto entregado a caja ruta"), {
      x: leftX + pad,
      y: ly,
      size: FS.meta,
      font,
      color: WHITE,
    });
    ly -= lineH + 2;
    page.drawText(fmtMoney(snapshot.tuCajaDelDia), {
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

  // ——— Resumen: una fila de 6 métricas ———
  {
    y = sectionBarDark("Resumen", M, PAGE_W - 2 * M, y);
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
      "Total cobros",
      "Total gastos",
      "Caja del día",
      "Clientes pagaron",
      "Clientes no pagaron",
      "Préstamos caja",
    ];
    const vals = [
      fmtMoney(snapshot.totalCobrosLista),
      fmtMoney(snapshot.totalGastosDia),
      fmtMoney(snapshot.tuCajaDelDia),
      String(snapshot.cobros.length),
      String(snapshot.noPagos.length),
      fmtMoney(snapshot.totalPrestamosDesembolsoDia ?? 0),
    ];

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
  }

  spacer(10);

  // ——— Cobros del día ———
  {
    y = sectionBarDark("Cobros del día", M, PAGE_W - 2 * M, y);
    const innerPad = 2;
    const x0 = tblEdge + innerPad;
    const sumW = tblW - 2 * innerPad;
    const gapsCobros = 6 * COL_GAP;
    const wHr = 70;
    const wMet = 34;
    const wCuo = 38;
    const wDeb = 50;
    const wTP = 58;
    const wCob = 56;
    const wCli = sumW - (wHr + wMet + wCuo + wDeb + wTP + wCob + gapsCobros);

    const xCli = x0;
    const xCob = xCli + wCli + COL_GAP;
    const xTP = xCob + wCob + COL_GAP;
    const xDeb = xTP + wTP + COL_GAP;
    const xCuo = xDeb + wDeb + COL_GAP;
    const xMet = xCuo + wCuo + COL_GAP;
    const xHr = xMet + wMet + COL_GAP;

    ensureBottom(TB.lh + 8);
    tableRow(
      [
        { text: "Cliente", x: xCli, w: wCli, bold: true, color: COL.tableHead },
        { text: "Cobro", x: xCob, w: wCob, bold: true, color: COL.tableHead, align: "right" },
        { text: "Tot. préstamo", x: xTP, w: wTP, bold: true, color: COL.tableHead, align: "right" },
        { text: "Debe", x: xDeb, w: wDeb, bold: true, color: COL.tableHead, align: "right" },
        { text: "Cuotas", x: xCuo, w: wCuo, bold: true, color: COL.tableHead, align: "right" },
        { text: "Método", x: xMet, w: wMet, bold: true, color: COL.tableHead },
        { text: "Hora", x: xHr, w: wHr, bold: true, color: COL.tableHead },
      ],
      y
    );
    advanceY(TB.lh + 4);
    let sumCobros = 0;
    for (const c of snapshot.cobros) {
      if (rowBudget <= 0) break;
      sumCobros += c.monto;
      const hora = c.fecha
        ? new Date(c.fecha).toLocaleTimeString("es-CO", {
            timeZone: "America/Bogota",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "—";
      const cuotasTxt = formatoCuotasRestanteTotal(c.cuotasFaltantes, c.numeroCuotas);
      ensureBottom(TB.lh + 6);
      tableRow(
        [
          { text: trunc(c.clienteNombre, 42), x: xCli, w: wCli },
          {
            text: fmtMoney(c.monto),
            x: xCob,
            w: wCob,
            align: "right",
          },
          {
            text: fmtMoney(c.totalAPagar),
            x: xTP,
            w: wTP,
            align: "right",
          },
          {
            text: fmtMoney(c.saldoPendienteTrasPago),
            x: xDeb,
            w: wDeb,
            align: "right",
          },
          {
            text: cuotasTxt,
            x: xCuo,
            w: wCuo,
            align: "right",
          },
          {
            text: trunc(c.metodoPago ?? "—", 14),
            x: xMet,
            w: wMet,
          },
          {
            text: hora,
            x: xHr,
            w: wHr,
            noTrunc: true,
          },
        ],
        y
      );
      advanceY(TB.lh);
      rowBudget--;
    }
    if (snapshot.cobros.length > MAX_ROWS_DETALLE) {
      line(`… y ${snapshot.cobros.length - MAX_ROWS_DETALLE} cobros más (consultar en el sistema).`, {
        color: COL.muted,
        size: FS.small,
      });
    }
    ensureBottom(TB.lh + 8);
    hrTable();
    tableRow(
      [
        { text: "Total cobros", x: xCli, w: wCli, bold: true },
        {
          text: fmtMoney(sumCobros),
          x: xCob,
          w: wCob,
          bold: true,
          align: "right",
        },
        { text: "", x: xTP, w: wTP },
        { text: "", x: xDeb, w: wDeb },
        { text: "", x: xCuo, w: wCuo },
        { text: "", x: xMet, w: wMet },
        { text: "", x: xHr, w: wHr },
      ],
      y
    );
    advanceY(TB.lh + 8);
  }

  spacer(8);

  rowBudget = Math.min(40, MAX_ROWS_DETALLE);

  // ——— Visitas "no pagó" (sin columna Nota, como mock) ———
  {
    y = sectionBarDark('Visitas "no pagó"', M, PAGE_W - 2 * M, y);
    const innerPad = 2;
    const x0 = tblEdge + innerPad;
    const sumW = tblW - 2 * innerPad;
    const gapsNp = 4 * COL_GAP;
    const innerSum = sumW - gapsNp;
    const wCli = Math.max(36, Math.floor(innerSum * 0.22));
    const wMot = Math.max(36, Math.floor(innerSum * 0.22));
    const wCuo = Math.max(26, Math.floor(innerSum * 0.1));
    const wDeb = Math.max(42, Math.floor(innerSum * 0.23));
    const wTP = innerSum - wCli - wMot - wCuo - wDeb;

    const xCli = x0;
    const xMot = xCli + wCli + COL_GAP;
    const xCuo = xMot + wMot + COL_GAP;
    const xDeb = xCuo + wCuo + COL_GAP;
    const xTP = xDeb + wDeb + COL_GAP;

    const wTotEtiqueta = wCli + wMot + wCuo + 3 * COL_GAP;

    ensureBottom(TB.lh + 8);
    tableRow(
      [
        { text: "Cliente", x: xCli, w: wCli, bold: true, color: COL.tableHead },
        { text: "Motivo", x: xMot, w: wMot, bold: true, color: COL.tableHead },
        { text: "Cuotas", x: xCuo, w: wCuo, bold: true, color: COL.tableHead, align: "right" },
        { text: "Debe", x: xDeb, w: wDeb, bold: true, color: COL.tableHead, align: "right" },
        {
          text: "Tot. préstamo",
          x: xTP,
          w: wTP,
          bold: true,
          color: COL.tableHead,
          align: "right",
        },
      ],
      y
    );
    advanceY(TB.lh + 4);
    let sumDebe = 0;
    if (snapshot.noPagos.length === 0) {
      line("Sin registros.", { color: COL.muted, size: FS.meta });
    } else {
      for (const n of snapshot.noPagos) {
        if (rowBudget <= 0) break;
        sumDebe += n.saldoPendientePrestamoActual;
        const cuotasNp = formatoCuotasRestanteTotal(n.cuotasPendientes, n.numeroCuotas);
        ensureBottom(TB.lh + 6);
        tableRow(
          [
            { text: trunc(n.clienteNombre, 36), x: xCli, w: wCli },
            { text: trunc(n.motivoNoPago, 28), x: xMot, w: wMot },
            {
              text: cuotasNp,
              x: xCuo,
              w: wCuo,
              align: "right",
            },
            {
              text: fmtMoney(n.saldoPendientePrestamoActual),
              x: xDeb,
              w: wDeb,
              align: "right",
            },
            {
              text: fmtMoney(n.totalAPagar),
              x: xTP,
              w: wTP,
              align: "right",
            },
          ],
          y
        );
        advanceY(TB.lh);
        rowBudget--;
      }
    }
    ensureBottom(TB.lh + 8);
    hrTable();
    tableRow(
      [
        { text: "Total saldo debe", x: xCli, w: wTotEtiqueta, bold: true },
        {
          text: snapshot.noPagos.length ? fmtMoney(sumDebe) : fmtMoney(0),
          x: xDeb,
          w: wDeb,
          bold: true,
          align: "right",
        },
        { text: "", x: xTP, w: wTP },
      ],
      y
    );
    advanceY(TB.lh + 8);
  }

  spacer(10);

  // ——— Gastos (izq) + Préstamos (der), pies alineados ———
  {
    ensureBottom(280);
    const gap = 10;
    const colW = (PAGE_W - 2 * M - gap) / 2;
    const xL = M;
    const xR = M + colW + gap;
    const yStart = y;

    const gastos = snapshot.gastosDelDia;
    const prestamosRows = snapshot.prestamosDesembolsoDelDia ?? [];
    const bodyLinesG = gastos.length === 0 ? 1 : gastos.length;
    const bodyLinesP = prestamosRows.length === 0 ? 1 : prestamosRows.length;
    const maxBodyLines = Math.max(bodyLinesG, bodyLinesP);
    const padGastos = maxBodyLines - bodyLinesG;
    const padPrestamos = maxBodyLines - bodyLinesP;

    const hrDual = (xBox: number, yy: number) => {
      const lift = 7;
      page.drawLine({
        start: { x: xBox + 4, y: yy + lift },
        end: { x: xBox + colW - 4, y: yy + lift },
        thickness: 0.35,
        color: COL.rule,
      });
      return yy - 6;
    };

    const drawPrestamosBlock = (startY: number, blankRows: number): number => {
      let yy = sectionBarDark("Préstamos otorgados", xR, colW, startY);
      const innerPad = 2;
      const px = xR + innerPad + 4;
      const usable = colW - 12 - 2 * innerPad;
      const gapsP = 3 * COL_GAP;
      const uInner = usable - gapsP;
      const wh = Math.max(68, Math.floor(uInner * 0.28));
      const wc = Math.floor((uInner - wh) * 0.45);
      const cap = Math.floor((uInner - wh) * 0.28);
      const wt = uInner - wh - wc - cap;

      const xPc = px;
      const xPcap = xPc + wc + COL_GAP;
      const xPtot = xPcap + cap + COL_GAP;
      const xPh = xPtot + wt + COL_GAP;

      tableRow(
        [
          { text: "Cliente", x: xPc, w: wc, bold: true, color: COL.tableHead },
          { text: "Capital", x: xPcap, w: cap, bold: true, color: COL.tableHead, align: "right" },
          { text: "Tot. pagar", x: xPtot, w: wt, bold: true, color: COL.tableHead, align: "right" },
          { text: "Hora", x: xPh, w: wh, bold: true, color: COL.tableHead },
        ],
        yy
      );
      yy -= TB.lh + 4;
      let sumCap = 0;
      let sumTot = 0;
      if (prestamosRows.length === 0) {
        page.drawText(sanitizarTextoPdf("Sin movimientos este día."), {
          x: px,
          y: yy,
          size: FS.meta,
          font,
          color: COL.muted,
        });
        yy -= TB.lh;
      } else {
        for (const p of prestamosRows) {
          if (rowBudget <= 0) break;
          sumCap += p.monto;
          sumTot += p.totalAPagar;
          const hora = p.fecha
            ? new Date(p.fecha).toLocaleTimeString("es-CO", {
                timeZone: "America/Bogota",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : "—";
          tableRow(
            [
              { text: trunc(p.clienteNombre, 22), x: xPc, w: wc },
              {
                text: fmtMoney(p.monto),
                x: xPcap,
                w: cap,
                align: "right",
              },
              {
                text: fmtMoney(p.totalAPagar),
                x: xPtot,
                w: wt,
                align: "right",
              },
              { text: hora, x: xPh, w: wh, noTrunc: true },
            ],
            yy
          );
          yy -= TB.lh;
          rowBudget--;
        }
      }
      for (let i = 0; i < blankRows; i++) {
        yy -= TB.lh;
      }
      yy = hrDual(xR, yy);
      tableRow(
        [
          { text: "Total", x: xPc, w: wc, bold: true },
          {
            text: prestamosRows.length ? fmtMoney(sumCap) : fmtMoney(0),
            x: xPcap,
            w: cap,
            bold: true,
            align: "right",
          },
          {
            text: prestamosRows.length ? fmtMoney(sumTot) : fmtMoney(0),
            x: xPtot,
            w: wt,
            bold: true,
            align: "right",
          },
          { text: "", x: xPh, w: wh },
        ],
        yy
      );
      yy -= TB.lh + 6;
      return yy;
    };

    const drawGastosBlock = (startY: number, blankRows: number): number => {
      let yy = sectionBarDark("Gastos del día", xL, colW, startY);
      const innerPad = 2;
      const px = xL + innerPad + 4;
      const usable = colW - 12 - 2 * innerPad;
      const gapsG = 2 * COL_GAP;
      const wMonto = 58;
      const wMot = 66;
      const wDesc = Math.max(24, usable - wMonto - wMot - gapsG);

      const xGm = px;
      const xGt = xGm + wMonto + COL_GAP;
      const xGd = xGt + wMot + COL_GAP;

      tableRow(
        [
          { text: "Monto", x: xGm, w: wMonto, bold: true, color: COL.tableHead, align: "right" },
          { text: "Motivo", x: xGt, w: wMot, bold: true, color: COL.tableHead },
          { text: "Descripción", x: xGd, w: wDesc, bold: true, color: COL.tableHead },
        ],
        yy
      );
      yy -= TB.lh + 4;
      let sumG = 0;
      if (gastos.length === 0) {
        page.drawText(sanitizarTextoPdf("Sin gastos registrados."), {
          x: px,
          y: yy,
          size: FS.meta,
          font,
          color: COL.muted,
        });
        yy -= TB.lh;
      } else {
        for (const g of gastos) {
          if (rowBudget <= 0) break;
          sumG += g.monto;
          tableRow(
            [
              {
                text: fmtMoney(g.monto),
                x: xGm,
                w: wMonto,
                align: "right",
              },
              { text: trunc(g.motivo, 18), x: xGt, w: wMot },
              { text: trunc(g.descripcion, 48), x: xGd, w: wDesc },
            ],
            yy
          );
          yy -= TB.lh;
          rowBudget--;
        }
      }
      for (let i = 0; i < blankRows; i++) {
        yy -= TB.lh;
      }
      yy = hrDual(xL, yy);
      tableRow(
        [
          {
            text: gastos.length ? fmtMoney(sumG) : fmtMoney(0),
            x: xGm,
            w: wMonto,
            bold: true,
            align: "right",
          },
          { text: "Total gastos", x: xGt, w: wMot, bold: true },
          { text: "", x: xGd, w: wDesc },
        ],
        yy
      );
      yy -= TB.lh + 6;
      return yy;
    };

    const endL = drawGastosBlock(yStart, padGastos);
    const endR = drawPrestamosBlock(yStart, padPrestamos);
    y = Math.min(endL, endR);
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
