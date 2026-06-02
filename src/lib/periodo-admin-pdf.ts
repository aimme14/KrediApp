import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { PeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";
import {
  gastosPersonalesAdminSnapshot,
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
  ganancias: number;
  gastos: number;
  perdidas: number;
};

function buildAdminDetalleFila(
  nombreAdmin: string,
  ap: PeriodoAdminSnapshot,
  ci: PeriodoAdminSnapshot | null
): DetalleFila {
  const rc = ci ?? ap;
  return {
    nombre: nombreAdmin,
    capAp: ap.admin.capitalAdmin,
    capCi: ci?.admin.capitalAdmin ?? null,
    ganancias: gananciasRutasAdmin(rc),
    gastos: ci ? gastosPersonalesAdminSnapshot(ci) : 0,
    perdidas: 0,
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

  // ── Resumen ejecutivo (KPIs) ──────────────────────────────────────────────

  const capAdminAp = payload.apertura.admin.capitalAdmin;
  const capAdminCi = payload.cierre?.admin.capitalAdmin ?? null;
  const utilidadNeta = capAdminCi !== null ? capAdminCi - capAdminAp : 0;

  const totAp = payload.apertura.rutas.reduce(
    (a, r) => ({
      capital: a.capital + r.capitalRuta,
      ganancias: a.ganancias + r.ganancias,
      gastos: a.gastos + gastosTotalesRutaSnapshot(r),
      perdidas: a.perdidas + r.perdidas,
    }),
    { capital: 0, ganancias: 0, gastos: 0, perdidas: 0 }
  );

  const totCi = payload.cierre
    ? payload.cierre.rutas.reduce(
        (a, r) => ({
          capital: a.capital + r.capitalRuta,
          ganancias: a.ganancias + r.ganancias,
          gastos: a.gastos + gastosTotalesRutaSnapshot(r),
          perdidas: a.perdidas + r.perdidas,
        }),
        { capital: 0, ganancias: 0, gastos: 0, perdidas: 0 }
      )
    : null;

<<<<<<< HEAD
  const utilidadNeta =
    totCi !== null ? totCi.capital - totAp.capital : totAp.capital;

  // 3 KPI cards
  const kpis = [
    { label: "Capital apertura", value: fmtMoney(totAp.capital) },
    { label: "Capital cierre", value: totCi ? fmtMoney(totCi.capital) : "—" },
=======
  const kpis = [
    { label: "Capital apertura", value: fmtMoney(capAdminAp) },
    { label: "Capital cierre", value: capAdminCi !== null ? fmtMoney(capAdminCi) : "—" },
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
    {
      label: "Utilidad neta",
      value: capAdminCi !== null ? fmtMoney(utilidadNeta) : "—",
      highlight: true,
    },
<<<<<<< HEAD
=======
    {
      label: "Variacion capital",
      value: capAdminCi !== null ? fmtDelta(capAdminAp, capAdminCi) : "—",
      delta: true,
    },
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
  ];

  const kpiW = (CONTENT_W - 8) / 3;
  kpis.forEach((kpi, i) => {
    const kx = ML + i * (kpiW + 4);
<<<<<<< HEAD
    const isPos = totCi ? utilidadNeta >= 0 : true;
    const cardColor = kpi.highlight ? (isPos ? C.success : C.danger) : C.accent;
=======
    const isPos = capAdminCi !== null ? utilidadNeta >= 0 : true;
    const cardColor = kpi.highlight
      ? (isPos ? C.success : C.danger)
      : kpi.delta
        ? (capAdminCi !== null && capAdminCi >= capAdminAp ? C.success : C.danger)
        : C.accent;
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7

    page.drawRectangle({ x: kx, y: y - 44, width: kpiW, height: 44, color: rgb(0.97,0.97,0.98) });
    page.drawRectangle({ x: kx, y: y - 44, width: 3, height: 44, color: cardColor });
    txt(kpi.label, kx + 7, y - 14, 7, font, C.muted);
    txt(kpi.value, kx + 7, y - 30, 10, fontBold, kpi.highlight ? cardColor : C.text, kpiW - 12);
  });

  y -= 56;

<<<<<<< HEAD
  type ColDef = { x: number; w: number };
  type DetalleCols = {
    nombre: ColDef;
    capAp: ColDef;
    capCi: ColDef;
    ganancias: ColDef;
    gastos: ColDef;
    utilidad: ColDef;
    perdidas?: ColDef;
  };

  const colsRuta: DetalleCols = {
    nombre:    { x: ML,           w: 130 },
    capAp:     { x: ML + 134,     w: 95  },
    capCi:     { x: ML + 233,     w: 95  },
    ganancias: { x: ML + 332,     w: 95  },
    gastos:    { x: ML + 431,     w: 95  },
    perdidas:  { x: ML + 530,     w: 90  },
    utilidad:  { x: ML + 624,     w: 106 },
  };

  const colsAdmin: DetalleCols = {
    nombre:    { x: ML,           w: 130 },
    capAp:     { x: ML + 134,     w: 105 },
    capCi:     { x: ML + 243,     w: 105 },
    ganancias: { x: ML + 352,     w: 105 },
    gastos:    { x: ML + 461,     w: 115 },
    utilidad:  { x: ML + 580,     w: 150 },
  };

  const drawDetalleFila = (
    fila: DetalleFila,
    rowY: number,
    cols: DetalleCols,
    opts?: { zebra?: boolean; total?: boolean; showPerdidas?: boolean }
  ) => {
    const capAp = fila.capAp;
    const capCi = fila.capCi;
    const util = capCi !== null ? capCi - capAp : null;

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

    txt(fila.nombre, cols.nombre.x + 3, textY, sz, nameFont, nameColor, cols.nombre.w - 4);
    txt(fmtMoney(capAp), cols.capAp.x + 3, textY, sz, valueFont, valueColor);
    txt(capCi !== null ? fmtMoney(capCi) : "—", cols.capCi.x + 3, textY, sz, valueFont, valueColor);
    txt(fmtMoney(fila.ganancias), cols.ganancias.x + 3, textY, sz, valueFont, valueColor);
    txt(fmtMoney(fila.gastos), cols.gastos.x + 3, textY, sz, valueFont, valueColor);
    if (opts?.showPerdidas !== false && cols.perdidas) {
      txt(fmtMoney(fila.perdidas), cols.perdidas.x + 3, textY, sz, valueFont, valueColor);
    }

    if (util !== null) {
      const utilColor = opts?.total ? rgb(1, 1, 1) : util >= 0 ? C.success : C.danger;
      txt(fmtMoney(util), cols.utilidad.x + 3, textY, sz, fontBold, utilColor);
    } else {
      txt("—", cols.utilidad.x + 3, textY, sz, font, opts?.total ? rgb(1, 1, 1) : C.muted);
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
    const headers: [string, keyof DetalleCols][] = showPerdidas
      ? [
          [nombreHeader, "nombre"],
          ["Cap. Inicio", "capAp"],
          ["Cap. Final", "capCi"],
          ["Ganancias", "ganancias"],
          ["Gastos", "gastos"],
          ["Perdidas", "perdidas"],
          ["Util. cap.", "utilidad"],
        ]
      : [
          [nombreHeader, "nombre"],
          ["Cap. Inicio", "capAp"],
          ["Cap. Final", "capCi"],
          ["Ganancias", "ganancias"],
          ["Gastos", "gastos"],
          ["Util. cap.", "utilidad"],
        ];
    headers.forEach(([label, col]) => {
      const c = cols[col];
      if (!c) return;
      txt(label, c.x + 3, y - 12, 7, fontBold, C.headText);
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
=======
  // ── Sección Admin ─────────────────────────────────────────────────────────
  ensure(50);
  y -= 6;
  txt("Posicion del Administrador", ML, y, 10, fontBold, C.brand);
  y -= 14;

  const adminKpis: {
    label: string;
    value: string;
    delta?: boolean;
    deltaVal?: number | null;
  }[] = [
    {
      label: "Caja admin apertura",
      value: fmtMoney(payload.apertura.admin.cajaAdmin),
    },
    {
      label: "Caja admin cierre",
      value: payload.cierre ? fmtMoney(payload.cierre.admin.cajaAdmin) : "—",
    },
    {
      label: "Capital admin apertura",
      value: fmtMoney(payload.apertura.admin.capitalAdmin),
    },
    {
      label: "Capital admin cierre",
      value: payload.cierre ? fmtMoney(payload.cierre.admin.capitalAdmin) : "—",
    },
    {
      label: "Variacion capital admin",
      value: payload.cierre
        ? fmtDelta(payload.apertura.admin.capitalAdmin, payload.cierre.admin.capitalAdmin)
        : "—",
      delta: true,
      deltaVal: payload.cierre
        ? payload.cierre.admin.capitalAdmin - payload.apertura.admin.capitalAdmin
        : null,
    },
    {
      label: "Ganancias rutas",
      value: fmtMoney(gananciasRutasAdmin(payload.cierre ?? payload.apertura)),
    },
    {
      label: "Gastos admin",
      value: fmtMoney((payload.cierre ?? payload.apertura).admin.gastosAdmin ?? 0),
    },
    {
      label: "Gastos totales",
      value: fmtMoney((payload.cierre ?? payload.apertura).admin.gastosTotales ?? 0),
    },
  ];

  const adminKpiW = (CONTENT_W - 28) / 8;
  adminKpis.forEach((kpi, i) => {
    const kx = ML + i * (adminKpiW + 4);
    const cardColor = kpi.delta
      ? (kpi.deltaVal !== null && kpi.deltaVal !== undefined && kpi.deltaVal >= 0 ? C.success : C.danger)
      : C.accent;

    page.drawRectangle({ x: kx, y: y - 40, width: adminKpiW, height: 40, color: rgb(0.97, 0.97, 0.98) });
    page.drawRectangle({ x: kx, y: y - 40, width: 3, height: 40, color: cardColor });
    txt(kpi.label, kx + 7, y - 12, 6.5, font, C.muted, adminKpiW - 10);
    txt(
      kpi.value,
      kx + 7,
      y - 27,
      9,
      fontBold,
      kpi.delta && kpi.deltaVal !== null && kpi.deltaVal !== undefined
        ? (kpi.deltaVal >= 0 ? C.success : C.danger)
        : C.text,
      adminKpiW - 10
    );
  });

  y -= 52;

  // ── Tabla de rutas ────────────────────────────────────────────────────────

  ensure(40);
  y -= 6;
  txt("Detalle por Ruta", ML, y, 10, fontBold, C.brand);
  y -= 14;

  const cols = {
    nombre:      { x: ML,       w: 90  },
    cajaAp:      { x: ML + 94,  w: 68  },
    cajaCi:      { x: ML + 166, w: 68  },
    inversiones: { x: ML + 238, w: 68  },
    capAp:       { x: ML + 310, w: 68  },
    capCi:       { x: ML + 382, w: 68  },
    variacion:   { x: ML + 454, w: 68  },
    ganancias:   { x: ML + 526, w: 62  },
    gastos:      { x: ML + 592, w: 62  },
    perdidas:    { x: ML + 658, w: 56  },
    utilidad:    { x: ML + 718, w: 52  },
  };

  // Header de tabla
  page.drawRectangle({ x: ML, y: y - 18, width: CONTENT_W, height: 18, color: C.headBg });
  const headers: [string, keyof typeof cols][] = [
    ["Ruta",        "nombre"],
    ["Caja inicio", "cajaAp"],
    ["Caja final",  "cajaCi"],
    ["Inversiones", "inversiones"],
    ["Cap. inicio", "capAp"],
    ["Cap. final",  "capCi"],
    ["Variacion",   "variacion"],
    ["Ganancias",   "ganancias"],
    ["Gastos",      "gastos"],
    ["Perdidas",    "perdidas"],
    ["Utilidad",    "utilidad"],
  ];
  headers.forEach(([label, col]) => {
    txt(label, cols[col].x + 3, y - 12, 7, fontBold, C.headText);
  });
  y -= 20;
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7

  const rutaIds = mergeRutas(payload.apertura, payload.cierre);
  const rutaFilas: DetalleFila[] = rutaIds.map((rid) => {
    const ra = payload.apertura.rutas.find((r) => r.rutaId === rid);
    const rc = payload.cierre?.rutas.find((r) => r.rutaId === rid);
<<<<<<< HEAD
    return {
      nombre: ra?.nombre ?? rc?.nombre ?? rid,
      capAp: ra?.capitalRuta ?? 0,
      capCi: rc?.capitalRuta ?? null,
      ganancias: rc?.ganancias ?? ra?.ganancias ?? 0,
      gastos: gastosTotalesRutaSnapshot(rc ?? ra),
      perdidas: rc?.perdidas ?? ra?.perdidas ?? 0,
    };
=======
    const nombre = ra?.nombre ?? rc?.nombre ?? rid;

    const capAp = ra?.capitalRuta ?? 0;
    const capCi = rc?.capitalRuta ?? null;
    const gan   = rc?.ganancias ?? ra?.ganancias ?? 0;
    const gas = gastosTotalesRuta(rc ?? ra);
    const per = rc?.perdidas ?? ra?.perdidas ?? 0;
    const util =
      rc && ra ? rc.capitalRuta - ra.capitalRuta : null;

    // Fila alterna
    if (idx % 2 === 0) {
      page.drawRectangle({ x: ML, y: y - 15, width: CONTENT_W, height: 15, color: C.rowEven });
    }

    txt(nombre, cols.nombre.x + 3, y - 10, 7, fontBold, C.text, cols.nombre.w - 4);
    txt(fmtMoney(ra?.cajaRuta ?? 0), cols.cajaAp.x + 3, y - 10, 7, font, C.text);
    txt(rc ? fmtMoney(rc.cajaRuta) : "—", cols.cajaCi.x + 3, y - 10, 7, font, C.text);
    txt(fmtMoney(rc?.inversiones ?? ra?.inversiones ?? 0), cols.inversiones.x + 3, y - 10, 7, font, C.text);
    txt(fmtMoney(capAp), cols.capAp.x + 3, y - 10, 7, font, C.text);
    txt(capCi !== null ? fmtMoney(capCi) : "—", cols.capCi.x + 3, y - 10, 7, font, C.text);

    // Variación con color
    if (capCi !== null) {
      const deltaVal = capCi - capAp;
      const deltaColor = deltaVal >= 0 ? C.success : C.danger;
      txt(fmtDelta(capAp, capCi), cols.variacion.x + 3, y - 10, 7, fontBold, deltaColor);
    } else {
      txt("—", cols.variacion.x + 3, y - 10, 7, font, C.muted);
    }

    txt(fmtMoney(gan), cols.ganancias.x + 3, y - 10, 7, font, C.text);
    txt(fmtMoney(gas), cols.gastos.x + 3, y - 10, 7, font, C.text);
    txt(fmtMoney(per), cols.perdidas.x + 3, y - 10, 7, font, C.text);

    // Utilidad con color
    if (util !== null) {
      const utilColor = util >= 0 ? C.success : C.danger;
      txt(fmtMoney(util), cols.utilidad.x + 3, y - 10, 7, fontBold, utilColor);
    } else {
      txt("—", cols.utilidad.x + 3, y - 10, 7, font, C.muted);
    }

    y -= 16;
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
  });

  const rutaTotal: DetalleFila | null =
    rutaIds.length > 1
      ? {
          nombre: "TOTAL",
          capAp: totAp.capital,
          capCi: totCi?.capital ?? null,
          ganancias: totCi?.ganancias ?? totAp.ganancias,
          gastos: totCi?.gastos ?? totAp.gastos,
          perdidas: totCi?.perdidas ?? totAp.perdidas,
        }
      : null;

<<<<<<< HEAD
  drawDetalleSection("Detalle por Ruta", "Ruta", rutaFilas, colsRuta, { totalFila: rutaTotal });
=======
    const deltaTotal = totCi ? totCi.capital - totAp.capital : null;

    txt("TOTAL", cols.nombre.x + 3, y - 12, 8, fontBold, rgb(1,1,1));
    txt(
      fmtMoney(payload.apertura.rutas.reduce((s, r) => s + r.cajaRuta, 0)),
      cols.cajaAp.x + 3,
      y - 12,
      7,
      fontBold,
      rgb(1, 1, 1)
    );
    txt(
      payload.cierre
        ? fmtMoney(payload.cierre.rutas.reduce((s, r) => s + r.cajaRuta, 0))
        : "—",
      cols.cajaCi.x + 3,
      y - 12,
      7,
      fontBold,
      rgb(1, 1, 1)
    );
    txt(
      fmtMoney((payload.cierre ?? payload.apertura).rutas.reduce((s, r) => s + r.inversiones, 0)),
      cols.inversiones.x + 3,
      y - 12,
      7,
      fontBold,
      rgb(1, 1, 1)
    );
    txt(fmtMoney(totAp.capital), cols.capAp.x + 3, y - 12, 8, fontBold, rgb(1,1,1));
    txt(totCi ? fmtMoney(totCi.capital) : "—", cols.capCi.x + 3, y - 12, 8, fontBold, rgb(1,1,1));
    txt(deltaTotal !== null ? fmtDelta(totAp.capital, totCi!.capital) : "—", cols.variacion.x + 3, y - 12, 8, fontBold, rgb(1,1,1));
    txt(fmtMoney(totCi?.ganancias ?? totAp.ganancias), cols.ganancias.x + 3, y - 12, 8, fontBold, rgb(1,1,1));
    txt(fmtMoney(totCi?.gastos ?? totAp.gastos), cols.gastos.x + 3, y - 12, 8, fontBold, rgb(1,1,1));
    txt(fmtMoney(totCi?.perdidas ?? totAp.perdidas), cols.perdidas.x + 3, y - 12, 8, fontBold, rgb(1,1,1));
    txt(
      totCi ? fmtMoney(totCi.capital - totAp.capital) : "—",
      cols.utilidad.x + 3,
      y - 12,
      8,
      fontBold,
      rgb(1, 1, 1)
    );
    y -= 20;
  }
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7

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
