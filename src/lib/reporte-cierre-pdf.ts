import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
const COL = {
  text: rgb(0.11, 0.13, 0.17),
  muted: rgb(0.42, 0.44, 0.48),
  accent: rgb(0.16, 0.36, 0.58),
  accentDark: rgb(0.1, 0.22, 0.4),
  band: rgb(0.93, 0.95, 0.98),
  bandStrong: rgb(0.88, 0.93, 0.98),
  rule: rgb(0.78, 0.81, 0.86),
  highlight: rgb(0.94, 0.97, 0.95),
  footer: rgb(0.5, 0.52, 0.55),
};

const MAX_ROWS_DETALLE = 80;

export async function buildReporteCierrePdf(
  snapshot: CierreDiaSnapshot,
  meta: ReporteCierrePdfMeta
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const FS = {
    title: 17,
    subtitle: 9.5,
    body: 9,
    small: 7.5,
    section: 10.5,
    meta: 9,
  };

  const LH = { body: 11.5, tight: 10, sectionGap: 14 };

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
      thickness: 0.6,
      color: COL.rule,
    });
    y -= 10;
  };

  const section = (title: string) => {
    ensureBottom(36);
    spacer(8);
    const barH = 20;
    const yBottom = y - barH + 3;
    page.drawRectangle({
      x: M,
      y: yBottom,
      width: PAGE_W - 2 * M,
      height: barH,
      color: COL.bandStrong,
      borderColor: COL.rule,
      borderWidth: 0.4,
    });
    page.drawText(sanitizarTextoPdf(title), {
      x: M + 10,
      y: yBottom + 6,
      size: FS.section,
      font: fontBold,
      color: COL.accentDark,
    });
    y = yBottom - 8;
  };

  const keyVal = (label: string, value: string, opts?: { emphasize?: boolean }) => {
    ensureBottom(20);
    const labelS = sanitizarTextoPdf(label);
    const valueS = sanitizarTextoPdf(value);
    const labelPart = `${labelS} `;
    const lw = font.widthOfTextAtSize(labelPart, FS.meta);
    page.drawText(labelPart, {
      x: M,
      y,
      size: FS.meta,
      font,
      color: COL.muted,
    });
    page.drawText(valueS, {
      x: M + Math.min(lw, 220),
      y,
      size: opts?.emphasize ? FS.meta + 0.5 : FS.meta,
      font: opts?.emphasize ? fontBold : font,
      color: opts?.emphasize ? COL.accentDark : COL.text,
    });
    y -= LH.body;
  };

  const highlightBand = (lines: { label: string; value: string }[]) => {
    ensureBottom(28 + lines.length * LH.body);
    const pad = 10;
    const lineH = LH.body;
    const boxH = pad * 2 + lines.length * lineH;
    const yBottom = y - boxH + 4;
    page.drawRectangle({
      x: M,
      y: yBottom,
      width: PAGE_W - 2 * M,
      height: boxH,
      color: COL.highlight,
      borderColor: rgb(0.72, 0.82, 0.76),
      borderWidth: 0.5,
    });
    let yy = yBottom + boxH - pad - 2;
    for (const row of lines) {
      const lab = sanitizarTextoPdf(row.label);
      const val = sanitizarTextoPdf(row.value);
      const lw = font.widthOfTextAtSize(`${lab} `, FS.meta);
      page.drawText(`${lab} `, {
        x: M + pad,
        y: yy,
        size: FS.meta,
        font,
        color: COL.muted,
      });
      page.drawText(val, {
        x: M + pad + Math.min(lw, 200),
        y: yy,
        size: FS.meta,
        font: fontBold,
        color: COL.accentDark,
      });
      yy -= lineH;
    }
    y = yBottom - 10;
  };

  // ——— Cabecera ———
  page.drawRectangle({
    x: M,
    y: y - 52,
    width: PAGE_W - 2 * M,
    height: 56,
    color: COL.band,
    borderColor: COL.rule,
    borderWidth: 0.5,
  });
  page.drawText(sanitizarTextoPdf("Reporte de cierre"), {
    x: M + 12,
    y: y - 22,
    size: FS.title,
    font: fontBold,
    color: COL.accentDark,
  });
  page.drawText(
    sanitizarTextoPdf("KrediApp · Documento operativo (Colombia)"),
    {
    x: M + 12,
    y: y - 40,
    size: FS.subtitle,
    font,
    color: COL.muted,
    }
  );
  y -= 64;
  spacer(4);

  keyVal("Fecha operativa:", snapshot.fechaDia);
  keyVal("Ruta:", trunc(meta.rutaNombre, 72));
  keyVal("Trabajador:", trunc(meta.empleadoNombre, 72));
  highlightBand([
    {
      label: "Monto entregado a caja ruta:",
      value: fmtMoney(meta.montoEntregado),
    },
  ]);
  keyVal(
    "Aprobado:",
    meta.aprobadoEn.toLocaleString("es-CO", { timeZone: "America/Bogota" })
  );
  spacer(4);
  line(
    meta.comentarioTrabajador
      ? `Comentario del trabajador: ${trunc(meta.comentarioTrabajador, 480)}`
      : "Comentario del trabajador: —",
    { size: FS.meta, color: COL.text }
  );
  hr();

  // ——— Resumen ———
  section("Resumen");
  keyVal("Total cobros del día:", fmtMoney(snapshot.totalCobrosLista));
  keyVal("Base asignada ese día:", fmtMoney(snapshot.totalBaseAsignadaDia));
  keyVal("Total gastos del día:", fmtMoney(snapshot.totalGastosDia));
  keyVal(
    "Préstamos desde tu caja:",
    fmtMoney(snapshot.totalPrestamosDesembolsoDia ?? 0)
  );
  keyVal("Tu caja del día:", fmtMoney(snapshot.tuCajaDelDia), { emphasize: true });
  line("Fórmula: cobros del día + base − gastos − préstamos desde tu caja.", {
    size: FS.small,
    color: COL.muted,
  });
  keyVal("Clientes que pagaron:", String(snapshot.cobros.length));
  keyVal("Clientes que no pagaron:", String(snapshot.noPagos.length));
  spacer(6);

  let rowBudget = MAX_ROWS_DETALLE;

  const bodyRow = (t: string) => {
    ensureBottom(18);
    page.drawText(sanitizarTextoPdf(trunc(t, 96)), {
      x: M + 4,
      y,
      size: FS.body - 0.5,
      font,
      color: COL.text,
    });
    y -= LH.tight;
    rowBudget--;
  };

  section("Préstamos otorgados desde tu caja");
  const prestamosRows = snapshot.prestamosDesembolsoDelDia ?? [];
  if (prestamosRows.length === 0) {
    line("Sin movimientos este día.", { color: COL.muted, size: FS.meta });
  } else {
    for (const p of prestamosRows) {
      if (rowBudget <= 0) break;
      const hora = p.fecha
        ? new Date(p.fecha).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })
        : "—";
      bodyRow(
        `${trunc(p.clienteNombre, 20)} · Capital ${fmtMoney(p.monto)} · Total a pagar ${fmtMoney(p.totalAPagar)} · ${hora}`
      );
    }
  }
  spacer(4);

  section("Cobros del día");
  for (const c of snapshot.cobros) {
    if (rowBudget <= 0) break;
    const hora = c.fecha
      ? new Date(c.fecha).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })
      : "—";
    const cuotasTxt = formatoCuotasRestanteTotal(c.cuotasFaltantes, c.numeroCuotas);
    bodyRow(
      `${trunc(c.clienteNombre, 14)} · Cobro ${fmtMoney(c.monto)} · Tot.prést ${fmtMoney(c.totalAPagar)} · Debe ${fmtMoney(c.saldoPendienteTrasPago)} · Cuotas ${cuotasTxt} · ${c.metodoPago ?? "—"} · ${hora}`
    );
  }
  if (snapshot.cobros.length > MAX_ROWS_DETALLE) {
    line(`… y ${snapshot.cobros.length - MAX_ROWS_DETALLE} cobros más (consultar en el sistema).`, {
      color: COL.muted,
      size: FS.small,
    });
  }
  spacer(4);

  rowBudget = Math.min(40, MAX_ROWS_DETALLE);
  section('Visitas «no pagó»');
  if (snapshot.noPagos.length === 0) {
    line("Sin registros.", { color: COL.muted, size: FS.meta });
  } else {
    for (const n of snapshot.noPagos) {
      if (rowBudget <= 0) break;
      const cuotasNp = formatoCuotasRestanteTotal(n.cuotasPendientes, n.numeroCuotas);
      const notaTxt = n.nota?.trim() ? trunc(n.nota.trim(), 20) : "—";
      bodyRow(
        `${trunc(n.clienteNombre, 14)} · ${trunc(n.motivoNoPago, 14)} · ${notaTxt} · Cuotas ${cuotasNp} · Debe ${fmtMoney(n.saldoPendientePrestamoActual)} · Tot.prést ${fmtMoney(n.totalAPagar)}`
      );
    }
  }
  spacer(4);

  section("Gastos del día");
  if (snapshot.gastosDelDia.length === 0) {
    line("Sin gastos registrados.", { color: COL.muted, size: FS.meta });
  } else {
    for (const g of snapshot.gastosDelDia) {
      bodyRow(
        `${fmtMoney(g.monto)} · Motivo: ${trunc(g.motivo, 16)} · ${trunc(g.descripcion, 48)}`
      );
    }
  }

  hr();
  ensureBottom(28);
  page.drawText(
    sanitizarTextoPdf("Documento generado al aprobar la entrega. No modificar."),
    {
    x: M,
    y: M + 8,
    size: FS.small,
    font,
    color: COL.footer,
    }
  );

  const bytes = await pdf.save();
  return bytes;
}
