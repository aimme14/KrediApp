import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { PeriodoAdminSnapshot } from "@/lib/periodo-admin-snapshot";

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

function fmtDelta(apertura: number, cierre: number): string {
  const diff = cierre - apertura;
  const signo = diff > 0 ? "+" : "";
  const raw = diff.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return san(`${signo}$ ${raw}`);
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

function gastosTotalesRuta(
  r: PeriodoAdminSnapshot["rutas"][0] | undefined
): number {
  if (!r) return 0;
  if (typeof r.gastosTotales === "number") return r.gastosTotales;
  const legacy = r as PeriodoAdminSnapshot["rutas"][0] & { gastos?: number };
  return typeof legacy.gastos === "number" ? legacy.gastos : 0;
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
  nombreEmpresa: string;
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

  txt(payload.nombreEmpresa, ML, PAGE_H - 30, 18, fontBold, rgb(1,1,1));
  txt(
    `Informe de Periodo Contable  |  Administrador: ${payload.nombreAdmin}`,
    ML, PAGE_H - 44, 8, font, rgb(0.85,0.75,0.65)
  );

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
      gastos: a.gastos + gastosTotalesRuta(r),
      perdidas: a.perdidas + r.perdidas,
    }),
    { capital: 0, ganancias: 0, gastos: 0, perdidas: 0 }
  );

  const totCi = payload.cierre
    ? payload.cierre.rutas.reduce(
        (a, r) => ({
          capital: a.capital + r.capitalRuta,
          ganancias: a.ganancias + r.ganancias,
          gastos: a.gastos + gastosTotalesRuta(r),
          perdidas: a.perdidas + r.perdidas,
        }),
        { capital: 0, ganancias: 0, gastos: 0, perdidas: 0 }
      )
    : null;

  const kpis = [
    { label: "Capital apertura", value: fmtMoney(capAdminAp) },
    { label: "Capital cierre", value: capAdminCi !== null ? fmtMoney(capAdminCi) : "—" },
    {
      label: "Utilidad neta",
      value: capAdminCi !== null ? fmtMoney(utilidadNeta) : "—",
      highlight: true,
    },
    {
      label: "Variacion capital",
      value: capAdminCi !== null ? fmtDelta(capAdminAp, capAdminCi) : "—",
      delta: true,
    },
  ];

  const kpiW = (CONTENT_W - 12) / 4;
  kpis.forEach((kpi, i) => {
    const kx = ML + i * (kpiW + 4);
    const isPos = capAdminCi !== null ? utilidadNeta >= 0 : true;
    const cardColor = kpi.highlight
      ? (isPos ? C.success : C.danger)
      : kpi.delta
        ? (capAdminCi !== null && capAdminCi >= capAdminAp ? C.success : C.danger)
        : C.accent;

    page.drawRectangle({ x: kx, y: y - 44, width: kpiW, height: 44, color: rgb(0.97,0.97,0.98) });
    page.drawRectangle({ x: kx, y: y - 44, width: 3, height: 44, color: cardColor });
    txt(kpi.label, kx + 7, y - 14, 7, font, C.muted);
    txt(kpi.value, kx + 7, y - 30, 10, fontBold,
      kpi.highlight || kpi.delta ? cardColor : C.text, kpiW - 12);
  });

  y -= 56;

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

  // Filas de datos
  const rutaIds = mergeRutas(payload.apertura, payload.cierre);
  rutaIds.forEach((rid, idx) => {
    ensure(18);
    const ra = payload.apertura.rutas.find((r) => r.rutaId === rid);
    const rc = payload.cierre?.rutas.find((r) => r.rutaId === rid);
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
  });

  // Fila de totales
  if (rutaIds.length > 1) {
    ensure(20);
    page.drawRectangle({ x: ML, y: y - 18, width: CONTENT_W, height: 18, color: C.totalBg });

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

  // ── Footer ────────────────────────────────────────────────────────────────

  const pageCount = pdf.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = pdf.getPage(i);
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 24, color: C.brand });
    p.drawText(san(`${payload.nombreEmpresa} — Informe generado el ${new Date().toLocaleDateString("es-CO")}`), {
      x: ML, y: 8, size: 7, font, color: rgb(0.7, 0.65, 0.60),
    });
    p.drawText(san(`Pagina ${i + 1} de ${pageCount}`), {
      x: PAGE_W - MR - 60, y: 8, size: 7, font, color: rgb(0.7, 0.65, 0.60),
    });
  }

  return pdf.save();
}
