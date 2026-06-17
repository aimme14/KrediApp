import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { PeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";
import {
  gastosPersonalesAdminSnapshot,
  gastosTotalesAdminSnapshot,
  gastosTotalesRutaSnapshot,
} from "@/lib/periodo-admin-gastos";

// ─── Utilidades ───────────────────────────────────────────────────────────────

function san(s: string): string {
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
  const raw = n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return san(`$ ${raw}`);
}

function fmtFecha(iso: string): string {
  return san(new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  }));
}

function gananciasRutasAdmin(s: PeriodoAdminSnapshot): number {
  const g = s.admin.gananciasRutas;
  if (typeof g === "number") return g;
  return s.rutas.reduce((sum, r) => sum + r.ganancias, 0);
}

function gastosTotalesAdmin(s: PeriodoAdminSnapshot): number {
  const g = s.admin.gastosTotales;
  if (typeof g === "number") return g;
  return gastosTotalesAdminSnapshot(s);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ganancias − gastos − pérdidas (misma fórmula que dashboard / resumen). */
function computeUtilidadNeta(ganancias: number, gastos: number, perdidas: number): number {
  return round2(ganancias - gastos - perdidas);
}

function perdidasTotalesRutas(s: PeriodoAdminSnapshot): number {
  return round2(s.rutas.reduce((sum, r) => sum + r.perdidas, 0));
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

type DetalleFila = {
  nombre: string;
  capAp: number;
  capCi: number | null;
  baseAp: number;
  baseCi: number | null;
  totalInvertido: number;
  ganancias: number;
  gastos: number;
  perdidas: number;
  /** Si se omite, se calcula con ganancias − gastos − pérdidas de la fila. */
  utilidadNeta?: number;
};

function buildAdminDetalleFila(
  nombreAdmin: string,
  ap: PeriodoAdminSnapshot,
  ci: PeriodoAdminSnapshot | null
): DetalleFila {
  const rc = ci ?? ap;
  const ganancias = gananciasRutasAdmin(rc);
  const gastosAdmin = ci ? gastosPersonalesAdminSnapshot(ci) : 0;
  const gastosTotales = ci ? gastosTotalesAdmin(ci) : 0;
  const perdidas = ci ? perdidasTotalesRutas(rc) : 0;
  return {
    nombre: nombreAdmin,
    capAp: ap.admin.capitalAdmin,
    capCi: ci?.admin.capitalAdmin ?? null,
    baseAp: ap.admin.cajaAdmin,
    baseCi: ci?.admin.cajaAdmin ?? null,
    totalInvertido: 0,
    ganancias,
    gastos: gastosAdmin,
    perdidas: 0,
    utilidadNeta: ci
      ? computeUtilidadNeta(ganancias, gastosTotales, perdidas)
      : undefined,
  };
}

// ─── Colores ──────────────────────────────────────────────────────────────────

const C = {
  brand:    rgb(0.12, 0.08, 0.06),  // marrón oscuro KrediApp
  accent:   rgb(0.55, 0.35, 0.10),  // marrón medio
  text:     rgb(0.10, 0.10, 0.12),
  muted:    rgb(0.45, 0.47, 0.50),
  success:  rgb(0.08, 0.55, 0.25),
  danger:   rgb(0.80, 0.15, 0.15),
  border:   rgb(0.82, 0.84, 0.87),
  rowEven:  rgb(0.97, 0.97, 0.98),
  headBg:   rgb(0.20, 0.22, 0.26),
  headText: rgb(1.00, 1.00, 1.00),
  totalBg:  rgb(0.20, 0.22, 0.26),
};

// ─── Layout ───────────────────────────────────────────────────────────────────

const PAGE_W = 842; // A4 landscape
const PAGE_H = 595;
const ML = 36;
const MR = 36;
const CONTENT_W = PAGE_W - ML - MR;

export type PeriodoAdminPdfPayload = {
  periodoId: string;
  nombreAdmin: string;
  fechaAperturaIso: string;
  fechaCierreIso: string | null;
  abiertoPorUid: string;
  cerradoPorUid: string | null;
  apertura: PeriodoAdminSnapshot;
  cierre: PeriodoAdminSnapshot | null;
};

// ─── Builder ──────────────────────────────────────────────────────────────────

export async function buildPeriodoAdminPdf(payload: PeriodoAdminPdfPayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 36;
  };

  const ensure = (need: number) => { if (y < 36 + need) newPage(); };

  const txt = (
    text: string,
    x: number,
    yy: number,
    sz: number,
    f: PDFFont,
    color = C.text,
    maxW?: number
  ) => {
    let t = san(text);
    if (maxW) {
      while (t.length > 3 && f.widthOfTextAtSize(t, sz) > maxW) {
        t = t.slice(0, -1);
      }
      if (t !== san(text)) t = t.slice(0, -1) + "…";
    }
    page.drawText(t, { x, y: yy, size: sz, font: f, color });
  };

  newPage();

  // ── Header ────────────────────────────────────────────────────────────────

  // Banda superior de color
  page.drawRectangle({
    x: 0, y: PAGE_H - 52, width: PAGE_W, height: 52,
    color: C.brand,
  });

  txt("Informe de Periodo Contable", ML, PAGE_H - 30, 14, fontBold, rgb(1, 1, 1));
  txt(`Administrador: ${payload.nombreAdmin}`, ML, PAGE_H - 44, 8, font, rgb(0.85, 0.75, 0.65));

  // Fechas en el lado derecho del header
  const fechaAp = fmtFecha(payload.fechaAperturaIso);
  const fechaCi = payload.fechaCierreIso ? fmtFecha(payload.fechaCierreIso) : "Abierto";
  txt(`Apertura: ${fechaAp}`, PAGE_W - MR - 200, PAGE_H - 32, 8, font, rgb(0.9,0.85,0.80));
  txt(`Cierre:      ${fechaCi}`, PAGE_W - MR - 200, PAGE_H - 44, 8, font, rgb(0.9,0.85,0.80));

  y = PAGE_H - 68;

  const totAp = payload.apertura.rutas.reduce(
    (a, r) => ({
      capital: a.capital + r.capitalRuta,
      base: a.base + r.cajaRuta,
      totalInvertido: a.totalInvertido + (r.totalPrestado ?? 0),
      ganancias: a.ganancias + r.ganancias,
      gastos: a.gastos + gastosTotalesRutaSnapshot(r),
      perdidas: a.perdidas + r.perdidas,
    }),
    { capital: 0, base: 0, totalInvertido: 0, ganancias: 0, gastos: 0, perdidas: 0 }
  );

  const totCi = payload.cierre
    ? payload.cierre.rutas.reduce(
        (a, r) => ({
          capital: a.capital + r.capitalRuta,
          base: a.base + r.cajaRuta,
          totalInvertido: a.totalInvertido + (r.totalPrestado ?? 0),
          ganancias: a.ganancias + r.ganancias,
          gastos: a.gastos + gastosTotalesRutaSnapshot(r),
          perdidas: a.perdidas + r.perdidas,
        }),
        { capital: 0, base: 0, totalInvertido: 0, ganancias: 0, gastos: 0, perdidas: 0 }
      )
    : null;

  type ColDef = { x: number; w: number };
  type DetalleColKey =
    | "nombre"
    | "capAp"
    | "capCi"
    | "baseAp"
    | "baseCi"
    | "totalInvertido"
    | "ganancias"
    | "gastos"
    | "perdidas"
    | "varCap"
    | "utlNet";
  type DetalleCols = Record<DetalleColKey, ColDef>;

  const COL_GAP = 3;

  /** Reparte columnas activas en todo CONTENT_W según pesos relativos. */
  const buildCols = (weights: Partial<Record<DetalleColKey, number>>): DetalleCols => {
    const order: DetalleColKey[] = [
      "nombre",
      "capAp",
      "capCi",
      "baseAp",
      "baseCi",
      "totalInvertido",
      "ganancias",
      "gastos",
      "perdidas",
      "varCap",
      "utlNet",
    ];
    const active = order.filter((k) => (weights[k] ?? 0) > 0);
    const gapTotal = COL_GAP * Math.max(0, active.length - 1);
    const available = CONTENT_W - gapTotal;
    const weightSum = active.reduce((s, k) => s + (weights[k] ?? 0), 0);

    let x = ML;
    const cols = {} as DetalleCols;
    for (const key of order) {
      const weight = weights[key] ?? 0;
      if (weight > 0) {
        const w = Math.floor((weight / weightSum) * available);
        cols[key] = { x, w };
        x += w + COL_GAP;
      } else {
        cols[key] = { x: 0, w: 0 };
      }
    }

    const lastKey = active[active.length - 1];
    if (lastKey) {
      const targetEnd = ML + CONTENT_W;
      const endX = cols[lastKey].x + cols[lastKey].w;
      cols[lastKey].w += targetEnd - endX;
    }

    return cols;
  };

  const colsRuta = buildCols({
    nombre: 1.15,
    capAp: 1,
    capCi: 1,
    baseAp: 1,
    baseCi: 1,
    totalInvertido: 1,
    ganancias: 1,
    gastos: 1,
    perdidas: 0.95,
    varCap: 1,
    utlNet: 1,
  });

  const colsAdmin = buildCols({
    nombre: 1.2,
    capAp: 1,
    capCi: 1,
    baseAp: 1,
    baseCi: 1,
    totalInvertido: 0,
    ganancias: 1,
    gastos: 1,
    perdidas: 0,
    varCap: 1,
    utlNet: 1,
  });

  const drawDetalleFila = (
    fila: DetalleFila,
    rowY: number,
    cols: DetalleCols,
    opts?: { zebra?: boolean; total?: boolean; showPerdidas?: boolean }
  ) => {
    const capAp = fila.capAp;
    const capCi = fila.capCi;
    const varCap = capCi !== null ? round2(capCi - capAp) : null;
    const utlNet =
      fila.utilidadNeta !== undefined
        ? fila.utilidadNeta
        : computeUtilidadNeta(fila.ganancias, fila.gastos, fila.perdidas);

    if (opts?.total) {
      page.drawRectangle({ x: ML, y: rowY - 18, width: CONTENT_W, height: 18, color: C.totalBg });
    } else if (opts?.zebra) {
      page.drawRectangle({ x: ML, y: rowY - 15, width: CONTENT_W, height: 15, color: C.rowEven });
    }

    const nameColor = opts?.total ? rgb(1, 1, 1) : C.text;
    const valueColor = opts?.total ? rgb(1, 1, 1) : C.text;
    const nameFont = opts?.total ? fontBold : fontBold;
    const valueFont = opts?.total ? fontBold : font;
    const textY = opts?.total ? rowY - 12 : rowY - 10;
    const sz = 8;

    const drawMoney = (col: ColDef | undefined, value: number | null) => {
      if (!col || col.w <= 0) return;
      txt(value !== null ? fmtMoney(value) : "—", col.x + 2, textY, sz, valueFont, valueColor, col.w - 3);
    };

    const drawSignedMoney = (
      col: ColDef | undefined,
      value: number | null,
      opts?: { total?: boolean }
    ) => {
      if (!col || col.w <= 0) return;
      if (value === null) {
        txt("—", col.x + 3, textY, sz, font, opts?.total ? rgb(1, 1, 1) : C.muted);
        return;
      }
      const color = opts?.total ? rgb(1, 1, 1) : value >= 0 ? C.success : C.danger;
      txt(fmtMoney(value), col.x + 3, textY, sz, fontBold, color);
    };

    txt(fila.nombre, cols.nombre.x + 2, textY, sz, nameFont, nameColor, cols.nombre.w - 3);
    drawMoney(cols.capAp, capAp);
    drawMoney(cols.capCi, capCi);
    drawMoney(cols.baseAp, fila.baseAp);
    drawMoney(cols.baseCi, fila.baseCi);
    drawMoney(cols.totalInvertido, fila.totalInvertido);
    drawMoney(cols.ganancias, fila.ganancias);
    drawMoney(cols.gastos, fila.gastos);
    if (opts?.showPerdidas !== false && cols.perdidas.w > 0) {
      drawMoney(cols.perdidas, fila.perdidas);
    }

    drawSignedMoney(cols.varCap, varCap, { total: opts?.total });
    if (capCi !== null) {
      drawSignedMoney(cols.utlNet, utlNet, { total: opts?.total });
    } else {
      txt("—", cols.utlNet.x + 3, textY, sz, font, opts?.total ? rgb(1, 1, 1) : C.muted);
    }
  };

  const drawDetalleSection = (
    sectionTitle: string,
    nombreHeader: string,
    filas: DetalleFila[],
    cols: DetalleCols,
    opts?: { totalFila?: DetalleFila | null; showPerdidas?: boolean }
  ) => {
    const showPerdidas = opts?.showPerdidas !== false;
    ensure(40);
    y -= 6;
    txt(sectionTitle, ML, y, 10, fontBold, C.brand);
    y -= 14;

    page.drawRectangle({ x: ML, y: y - 18, width: CONTENT_W, height: 18, color: C.headBg });
    const headers: [string, DetalleColKey][] = showPerdidas
      ? [
          [nombreHeader, "nombre"],
          ["Cap. Inicio", "capAp"],
          ["Cap. Final", "capCi"],
          ["Base Inicio", "baseAp"],
          ["Base Final", "baseCi"],
          ["Tot. Inv.", "totalInvertido"],
          ["Ganancias", "ganancias"],
          ["Gastos", "gastos"],
          ["Perdidas", "perdidas"],
          ["var. cap.", "varCap"],
          ["utl. net.", "utlNet"],
        ]
      : [
          [nombreHeader, "nombre"],
          ["Cap. Inicio", "capAp"],
          ["Cap. Final", "capCi"],
          ["Base Inicio", "baseAp"],
          ["Base Final", "baseCi"],
          ["Ganancias", "ganancias"],
          ["Gastos", "gastos"],
          ["var. cap.", "varCap"],
          ["utl. net.", "utlNet"],
        ];
    headers.forEach(([label, colKey]) => {
      const c = cols[colKey];
      if (!c || c.w <= 0) return;
      txt(label, c.x + 2, y - 12, 6.5, fontBold, C.headText, c.w - 3);
    });
    y -= 20;

    filas.forEach((fila, idx) => {
      ensure(18);
      drawDetalleFila(fila, y, cols, { zebra: idx % 2 === 0, showPerdidas });
      y -= 16;
    });

    if (opts?.totalFila) {
      ensure(20);
      drawDetalleFila(opts.totalFila, y, cols, { total: true, showPerdidas });
      y -= 20;
    }

    y -= 8;
  };

  const adminFila = buildAdminDetalleFila(payload.nombreAdmin, payload.apertura, payload.cierre);
  drawDetalleSection("Detalle del Admin", "Admin", [adminFila], colsAdmin, { showPerdidas: false });

  const rutaIds = mergeRutas(payload.apertura, payload.cierre);
  const rutaFilas: DetalleFila[] = rutaIds.map((rid) => {
    const ra = payload.apertura.rutas.find((r) => r.rutaId === rid);
    const rc = payload.cierre?.rutas.find((r) => r.rutaId === rid);
    return {
      nombre: ra?.nombre ?? rc?.nombre ?? rid,
      capAp: ra?.capitalRuta ?? 0,
      capCi: rc?.capitalRuta ?? null,
      baseAp: ra?.cajaRuta ?? 0,
      baseCi: rc?.cajaRuta ?? null,
      totalInvertido: rc?.totalPrestado ?? ra?.totalPrestado ?? 0,
      ganancias: rc?.ganancias ?? ra?.ganancias ?? 0,
      gastos: gastosTotalesRutaSnapshot(rc ?? ra),
      perdidas: rc?.perdidas ?? ra?.perdidas ?? 0,
    };
  });

  const rutaTotal: DetalleFila | null =
    rutaIds.length > 1
      ? {
          nombre: "TOTAL",
          capAp: totAp.capital,
          capCi: totCi?.capital ?? null,
          baseAp: totAp.base,
          baseCi: totCi?.base ?? null,
          totalInvertido: totCi?.totalInvertido ?? totAp.totalInvertido,
          ganancias: totCi?.ganancias ?? totAp.ganancias,
          gastos: totCi?.gastos ?? totAp.gastos,
          perdidas: totCi?.perdidas ?? totAp.perdidas,
        }
      : null;

  drawDetalleSection("Detalle por Ruta", "Ruta", rutaFilas, colsRuta, { totalFila: rutaTotal });

  // ── Footer ────────────────────────────────────────────────────────────────

  const pageCount = pdf.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = pdf.getPage(i);
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 24, color: C.brand });
    p.drawText(san(`Informe generado el ${new Date().toLocaleDateString("es-CO")}`), {
      x: ML, y: 8, size: 7, font, color: rgb(0.7, 0.65, 0.60),
    });
    p.drawText(san(`Pagina ${i + 1} de ${pageCount}`), {
      x: PAGE_W - MR - 60, y: 8, size: 7, font, color: rgb(0.7, 0.65, 0.60),
    });
  }

  return pdf.save();
}
