import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";

function sanitizarTextoPdf(s: string): string {
  let o = s;
  o = o.replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, " ");
  o = o.replace(/[\u2010-\u2015\u2212]/g, "-");
  const out: string[] = [];
  for (const ch of o) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) out.push(ch);
    else out.push("?");
  }
  return out.join("");
}

function fmtMoney(n: number): string {
  const raw = n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sanitizarTextoPdf(`$ ${raw}`);
}

const PAGE_W = 595;
const PAGE_H = 842;
const M = 48;
const COL_TEXT = rgb(0.11, 0.13, 0.17);
const COL_HEAD = rgb(0.22, 0.24, 0.28);
const COL_MUTED = rgb(0.42, 0.44, 0.48);

export type PeriodoAdminPdfPayload = {
  periodoId: string;
  fechaAperturaIso: string;
  fechaCierreIso: string | null;
  abiertoPorUid: string;
  cerradoPorUid: string | null;
  apertura: PeriodoAdminSnapshot;
  cierre: PeriodoAdminSnapshot | null;
};

function gananciasRutasAdmin(s: PeriodoAdminSnapshot): number {
  const g = s.admin.gananciasRutas;
  if (typeof g === "number") return g;
  return s.rutas.reduce((sum, r) => sum + r.ganancias, 0);
}

function mergeRutas(ap: PeriodoAdminSnapshot, ci: PeriodoAdminSnapshot | null) {
  const ids = new Set<string>();
  for (const r of ap.rutas) ids.add(r.rutaId);
  if (ci) for (const r of ci.rutas) ids.add(r.rutaId);
  const mapA = new Map(ap.rutas.map((r) => [r.rutaId, r]));
  const mapC = ci ? new Map(ci.rutas.map((r) => [r.rutaId, r])) : new Map<string, PeriodoAdminSnapshot["rutas"][0]>();
  return Array.from(ids).sort((a, b) => {
    const na = mapA.get(a)?.nombre ?? mapC.get(a)?.nombre ?? a;
    const nb = mapA.get(b)?.nombre ?? mapC.get(b)?.nombre ?? b;
    return na.localeCompare(nb, "es");
  });
}

export async function buildPeriodoAdminPdf(payload: PeriodoAdminPdfPayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M;
  };

  const ensure = (need: number) => {
    if (y < M + need) newPage();
  };

  const line = (t: string, opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) => {
    ensure(14);
    const sz = opts?.size ?? 9;
    const f = opts?.bold ? fontBold : font;
    const c = opts?.color ?? COL_TEXT;
    page.drawText(sanitizarTextoPdf(t), { x: M, y, size: sz, font: f, color: c });
    y -= 12;
  };

  const spacer = (n = 8) => {
    y -= n;
  };

  line("angry birds — Periodo contable (admin)", { bold: true, size: 14 });
  spacer(4);
  line(`Id periodo: ${payload.periodoId}`, { size: 8, color: COL_MUTED });
  line(`Apertura: ${new Date(payload.fechaAperturaIso).toLocaleString("es-CO")}`, { size: 8 });
  line(
    payload.fechaCierreIso
      ? `Cierre: ${new Date(payload.fechaCierreIso).toLocaleString("es-CO")}`
      : "Estado: abierto (sin cierre)",
    { size: 8 }
  );
  line(`Abierto por UID: ${payload.abiertoPorUid}`, { size: 7, color: COL_MUTED });
  if (payload.cerradoPorUid) {
    line(`Cerrado por UID: ${payload.cerradoPorUid}`, { size: 7, color: COL_MUTED });
  }
  spacer(12);

  const colA = M + 160;
  const colC = M + 320;
  ensure(24);
  page.drawText(sanitizarTextoPdf("Concepto"), { x: M, y, size: 8, font: fontBold, color: COL_HEAD });
  page.drawText(sanitizarTextoPdf("Apertura"), { x: colA, y, size: 8, font: fontBold, color: COL_HEAD });
  page.drawText(sanitizarTextoPdf("Cierre"), { x: colC, y, size: 8, font: fontBold, color: COL_HEAD });
  y -= 14;
  page.drawLine({
    start: { x: M, y },
    end: { x: PAGE_W - M, y },
    thickness: 0.5,
    color: rgb(0.78, 0.81, 0.86),
  });
  y -= 10;

  const row3 = (label: string, a: number, c: number | null) => {
    ensure(14);
    page.drawText(sanitizarTextoPdf(label), { x: M, y, size: 8, font, color: COL_TEXT });
    page.drawText(fmtMoney(a), { x: colA, y, size: 8, font, color: COL_TEXT });
    page.drawText(c === null ? "—" : fmtMoney(c), { x: colC, y, size: 8, font, color: COL_TEXT });
    y -= 11;
  };

  line("Administrador", { bold: true, size: 9 });
  row3("Caja admin", payload.apertura.admin.cajaAdmin, payload.cierre?.admin.cajaAdmin ?? null);
  row3("Capital admin", payload.apertura.admin.capitalAdmin, payload.cierre?.admin.capitalAdmin ?? null);
  row3(
    "Ganancias (suma rutas)",
    gananciasRutasAdmin(payload.apertura),
    payload.cierre ? gananciasRutasAdmin(payload.cierre) : null
  );
  spacer(8);

  line("Rutas (union apertura / cierre)", { bold: true, size: 9 });
  spacer(4);

  const rutaIds = mergeRutas(payload.apertura, payload.cierre);
  for (const rid of rutaIds) {
    ensure(80);
    const ra = payload.apertura.rutas.find((r) => r.rutaId === rid);
    const rc = payload.cierre?.rutas.find((r) => r.rutaId === rid);
    const nombre = ra?.nombre ?? rc?.nombre ?? rid;
    line(`— ${nombre}`, { bold: true, size: 8 });
    const z = (v: typeof ra) => ({
      cajaRuta: v?.cajaRuta ?? 0,
      inversiones: v?.inversiones ?? 0,
      ganancias: v?.ganancias ?? 0,
      perdidas: v?.perdidas ?? 0,
      gastos: v?.gastos ?? 0,
      capitalRuta: v?.capitalRuta ?? 0,
      utilidad: v?.utilidad ?? 0,
    });
    const za = z(ra);
    const zc = payload.cierre ? z(rc) : null;
    row3("  Base ruta (caja)", za.cajaRuta, zc?.cajaRuta ?? null);
    row3("  Inversiones", za.inversiones, zc?.inversiones ?? null);
    row3("  Ganancias", za.ganancias, zc?.ganancias ?? null);
    row3("  Perdidas", za.perdidas, zc?.perdidas ?? null);
    row3("  Gastos (ruta)", za.gastos, zc?.gastos ?? null);
    row3("  Capital ruta", za.capitalRuta, zc?.capitalRuta ?? null);
    row3("  Utilidad", za.utilidad, zc?.utilidad ?? null);
    spacer(6);
  }

  return pdf.save();
}
