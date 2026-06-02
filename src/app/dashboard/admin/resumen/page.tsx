"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listPeriodosAdmin,
  getPeriodoAdmin,
  abrirPeriodoAdmin,
  cerrarPeriodoAdmin,
  downloadPeriodoAdminPdf,
  type PeriodoAdminListaItem,
  type PeriodoAdminDetalle,
  type PeriodoAdminSnapshot,
  type PeriodoAdminSnapshotRuta,
} from "@/lib/empresa-api";

function mergeRutaIds(ap: PeriodoAdminSnapshot | null, ci: PeriodoAdminSnapshot | null): string[] {
  const ids = new Set<string>();
  if (ap) for (const r of ap.rutas) ids.add(r.rutaId);
  if (ci) for (const r of ci.rutas) ids.add(r.rutaId);
  const mapA = ap ? new Map(ap.rutas.map((r) => [r.rutaId, r])) : new Map<string, PeriodoAdminSnapshotRuta>();
  const mapC = ci ? new Map(ci.rutas.map((r) => [r.rutaId, r])) : new Map<string, PeriodoAdminSnapshotRuta>();
  return Array.from(ids).sort((a, b) => {
    const na = mapA.get(a)?.nombre ?? mapC.get(a)?.nombre ?? a;
    const nb = mapA.get(b)?.nombre ?? mapC.get(b)?.nombre ?? b;
    return na.localeCompare(nb, "es");
  });
}

function fmt(n: number) {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function gastosTotalesRuta(r: PeriodoAdminSnapshotRuta | undefined): number {
  if (!r) return 0;
  if (typeof r.gastosRuta === "number" || typeof r.gastosEmpleados === "number") {
    return (r.gastosRuta ?? 0) + (r.gastosEmpleados ?? 0);
  }
  if (typeof r.gastosTotales === "number") return r.gastosTotales;
  const legacy = r as PeriodoAdminSnapshotRuta & { gastos?: number };
  return typeof legacy.gastos === "number" ? legacy.gastos : 0;
}

function gastosPeriodoRuta(
  rc: PeriodoAdminSnapshotRuta | undefined,
  _ra: PeriodoAdminSnapshotRuta | undefined
): number {
  if (rc) return gastosTotalesRuta(rc);
  return 0;
}

function calcularTotales(rutas: PeriodoAdminSnapshotRuta[]) {
  return rutas.reduce(
    (acc, r) => ({
      cajaRuta: acc.cajaRuta + r.cajaRuta,
      inversiones: acc.inversiones + r.inversiones,
      ganancias: acc.ganancias + r.ganancias,
      perdidas: acc.perdidas + r.perdidas,
      gastosTotales: acc.gastosTotales + gastosTotalesRuta(r),
      capitalRuta: acc.capitalRuta + r.capitalRuta,
    }),
    {
      cajaRuta: 0,
      inversiones: 0,
      ganancias: 0,
      perdidas: 0,
      gastosTotales: 0,
      capitalRuta: 0,
    }
  );
}

export default function ResumenPage() {
  const { user, profile } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const [periodos, setPeriodos] = useState<PeriodoAdminListaItem[]>([]);
  const [periodosLoading, setPeriodosLoading] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [detalle, setDetalle] = useState<PeriodoAdminDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const loadPeriodos = useCallback(() => {
    if (!user) return;
    setPeriodosLoading(true);
    user.getIdToken().then((token) => {
      listPeriodosAdmin(token)
        .then(setPeriodos)
        .catch(() => setPeriodos([]))
        .finally(() => setPeriodosLoading(false));
    });
  }, [user]);

  useEffect(() => {
    loadPeriodos();
  }, [loadPeriodos]);

  const hayAbierto = useMemo(() => periodos.some((p) => p.estado === "abierto"), [periodos]);

  const handleAbrir = () => {
    if (!user) return;
    setAbriendo(true);
    setError(null);
    user.getIdToken().then((token) => {
      abrirPeriodoAdmin(token)
        .then(() => {
          loadPeriodos();
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Error al abrir periodo"))
        .finally(() => setAbriendo(false));
    });
  };

  const handleCerrar = () => {
    if (!user) return;
    setCerrando(true);
    setError(null);
    user.getIdToken().then((token) => {
      cerrarPeriodoAdmin(token)
        .then(() => {
          loadPeriodos();
          setDetalle(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Error al cerrar periodo"))
        .finally(() => setCerrando(false));
    });
  };

  const handleVerDetalle = (id: string) => {
    if (!user) return;
    setDetalleLoading(true);
    user.getIdToken().then((token) => {
      getPeriodoAdmin(token, id)
        .then(setDetalle)
        .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar detalle"))
        .finally(() => setDetalleLoading(false));
    });
  };

  const handlePdf = (id: string) => {
    if (!user) return;
    setPdfLoadingId(id);
    setError(null);
    user.getIdToken().then((token) => {
      downloadPeriodoAdminPdf(token, id)
        .catch((e) => setError(e instanceof Error ? e.message : "Error al descargar PDF"))
        .finally(() => setPdfLoadingId(null));
    });
  };

  if (!profile || profile.role !== "admin") return null;

  const ap = detalle?.apertura ?? null;
  const ci = detalle?.cierre ?? null;
  const rutaIdsComparar = detalle ? mergeRutaIds(ap, ci) : [];

  return (
    <>
      {error && (
        <p className="error-msg" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Periodos contables</h3>

        {hayAbierto && (
          <p style={{ marginBottom: "1rem", fontWeight: 600, color: "var(--accent, #5b21b6)" }}>
            Tienes un periodo abierto. Ciérralo cuando quieras congelar el cierre y poder abrir uno nuevo.
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAbrir}
            disabled={abriendo || cerrando || periodosLoading || hayAbierto}
          >
            {abriendo ? "Abriendo..." : "Abrir periodo"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCerrar}
            disabled={abriendo || cerrando || periodosLoading || !hayAbierto}
          >
            {cerrando ? "Cerrando..." : "Cerrar periodo"}
          </button>
        </div>

        {periodosLoading ? (
          <p>Cargando periodos...</p>
        ) : periodos.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay periodos. Usa &quot;Abrir periodo&quot; para empezar.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Estado</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id}>
                    <td>{periodos.length - periodos.indexOf(p)}</td>
                    <td>{p.estado === "abierto" ? "Abierto" : "Cerrado"}</td>
                    <td>{p.fechaApertura ? new Date(p.fechaApertura).toLocaleString("es-CO") : "-"}</td>
                    <td>{p.fechaCierre ? new Date(p.fechaCierre).toLocaleString("es-CO") : "Sin cierre"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", marginRight: "0.35rem" }}
                        onClick={() => handleVerDetalle(p.id)}
                      >
                        Ver / comparar
                      </button>
                      {p.estado === "cerrado" ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
                          onClick={() => handlePdf(p.id)}
                          disabled={pdfLoadingId === p.id}
                        >
                          {pdfLoadingId === p.id ? "PDF..." : "PDF"}
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "0.25rem" }}>
                          PDF al cerrar
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detalle || detalleLoading) && (
        <div className="card resumen-comparar-card" style={{ marginTop: "1rem" }} role="region" aria-label="Comparación de periodo">
          <div className="card-header-row resumen-comparar-header">
            <div>
              <h3>Comparación apertura / cierre</h3>
              {detalle && !detalleLoading && (
                <p className="resumen-comparar-meta">
                  {detalle.estado === "abierto" ? "Periodo abierto" : "Periodo cerrado"}
                  {detalle.fechaApertura
                    ? ` · Apertura ${new Date(detalle.fechaApertura).toLocaleString("es-CO")}`
                    : ""}
                  {detalle.fechaCierre
                    ? ` · Cierre ${new Date(detalle.fechaCierre).toLocaleString("es-CO")}`
                    : detalle.estado === "abierto"
                      ? " · Sin cierre"
                      : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary resumen-comparar-close-btn"
              onClick={() => setDetalle(null)}
              disabled={detalleLoading}
            >
              Cerrar
            </button>
          </div>
          {detalleLoading ? (
            <p className="resumen-comparar-loading">Cargando...</p>
          ) : detalle && ap ? (
            <>
<<<<<<< HEAD
              <p className="resumen-comparar-section-label">Rutas</p>
              <div className="resumen-comparar-cards" aria-label="Resumen por ruta">
                {rutaIdsComparar.map((rid) => {
                  const ra = ap.rutas.find((r) => r.rutaId === rid);
                  const rc = ci?.rutas.find((r) => r.rutaId === rid);
                  const nombre = ra?.nombre ?? rc?.nombre ?? rid;
                  const filas = [
                    { label: "Cap. apertura", value: fmt(ra?.capitalRuta ?? 0) },
                    { label: "Cap. cierre", value: rc ? fmt(rc.capitalRuta) : "—" },
                    { label: "Ganancias", value: fmt(rc?.ganancias ?? ra?.ganancias ?? 0) },
                    { label: "Gastos", value: fmt(gastosPeriodoRuta(rc, ra)) },
                    { label: "Pérdidas", value: fmt(rc?.perdidas ?? ra?.perdidas ?? 0) },
                  ];
                  return (
                    <article key={rid} className="resumen-comparar-ruta-card">
                      <h4 className="resumen-comparar-ruta-name">{nombre}</h4>
                      <dl className="resumen-comparar-dl">
                        {filas.map((f) => (
                          <div key={f.label} className="resumen-comparar-dl-row">
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  );
                })}
                {rutaIdsComparar.length > 1 &&
                  (() => {
                    const totAp = calcularTotales(ap.rutas);
                    const totCi = ci ? calcularTotales(ci.rutas) : null;
                    const filas = [
                      { label: "Cap. apertura", value: fmt(totAp.capitalRuta) },
                      { label: "Cap. cierre", value: totCi ? fmt(totCi.capitalRuta) : "—" },
                      { label: "Ganancias", value: fmt(totCi?.ganancias ?? totAp.ganancias) },
                      { label: "Gastos", value: fmt(totCi?.gastosTotales ?? totAp.gastosTotales) },
                      { label: "Pérdidas", value: fmt(totCi?.perdidas ?? totAp.perdidas) },
                    ];
                    return (
                      <article className="resumen-comparar-ruta-card resumen-comparar-ruta-card--total">
                        <h4 className="resumen-comparar-ruta-name">TOTAL</h4>
                        <dl className="resumen-comparar-dl">
                          {filas.map((f) => (
                            <div key={f.label} className="resumen-comparar-dl-row">
                              <dt>{f.label}</dt>
                              <dd>{f.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    );
                  })()}
              </div>
              <div className="table-wrap resumen-comparar-table-wrap">
                <table className="resumen-comparar-table">
                  <thead>
                    <tr>
                      <th className="resumen-col-ruta">Ruta</th>
                      <th className="col-num" title="Capital apertura">
                        Cap. apertura
                      </th>
                      <th className="col-num" title="Capital cierre">
                        Cap. cierre
                      </th>
=======
              {ap && (
                <>
                  <h4 style={{ marginTop: "1.25rem", marginBottom: "0.75rem" }}>
                    Posición del administrador
                  </h4>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: "0.75rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    {[
                      {
                        label: "Caja admin apertura",
                        valor: fmt(ap.admin.cajaAdmin),
                        color: "var(--text)",
                      },
                      {
                        label: "Caja admin cierre",
                        valor: ci ? fmt(ci.admin.cajaAdmin) : "—",
                        color: "var(--text)",
                      },
                      {
                        label: "Capital admin apertura",
                        valor: fmt(ap.admin.capitalAdmin),
                        color: "var(--text)",
                      },
                      {
                        label: "Capital admin cierre",
                        valor: ci ? fmt(ci.admin.capitalAdmin) : "—",
                        color: "var(--text)",
                      },
                      {
                        label: "Variación capital admin",
                        valor: ci
                          ? `${ci.admin.capitalAdmin - ap.admin.capitalAdmin >= 0 ? "+" : ""}${fmt(ci.admin.capitalAdmin - ap.admin.capitalAdmin)}`
                          : "—",
                        color: ci
                          ? ci.admin.capitalAdmin - ap.admin.capitalAdmin >= 0
                            ? "var(--success, #16a34a)"
                            : "var(--danger, #dc2626)"
                          : "var(--text-muted)",
                      },
                      {
                        label: "Ganancias rutas",
                        valor: fmt(ci?.admin.gananciasRutas ?? ap.admin.gananciasRutas ?? 0),
                        color: "var(--success, #16a34a)",
                      },
                      {
                        label: "Gastos admin",
                        valor: fmt(ci?.admin.gastosAdmin ?? ap.admin.gastosAdmin ?? 0),
                        color: "var(--danger, #dc2626)",
                      },
                      {
                        label: "Gastos totales",
                        valor: fmt(ci?.admin.gastosTotales ?? ap.admin.gastosTotales ?? 0),
                        color: "var(--danger, #dc2626)",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          padding: "0.875rem 1rem",
                          background: "var(--card-bg)",
                          border: "1px solid var(--card-border)",
                          borderRadius: "var(--radius)",
                        }}
                      >
                        <p
                          style={{
                            margin: "0 0 0.25rem",
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {item.label}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "1.1rem",
                            fontWeight: 700,
                            color: item.color,
                          }}
                        >
                          $ {item.valor}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <h4 style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>Rutas</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ruta</th>
                      <th className="col-num">Caja apertura</th>
                      <th className="col-num">Caja cierre</th>
                      <th className="col-num">Inversiones</th>
                      <th className="col-num">Capital apertura</th>
                      <th className="col-num">Capital cierre</th>
                      <th className="col-num">Variación</th>
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
                      <th className="col-num">Ganancias</th>
                      <th className="col-num" title="Gastos totales">
                        Gastos
                      </th>
                      <th className="col-num">Pérdidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rutaIdsComparar.map((rid) => {
                      const ra = ap.rutas.find((r) => r.rutaId === rid);
                      const rc = ci?.rutas.find((r) => r.rutaId === rid);
                      const nombre = ra?.nombre ?? rc?.nombre ?? rid;
                      return (
                        <tr key={rid}>
<<<<<<< HEAD
                          <td className="resumen-col-ruta">{nombre}</td>
=======
                          <td>{nombre}</td>
                          <td className="col-num">{fmt(ra?.cajaRuta ?? 0)}</td>
                          <td className="col-num">{rc ? fmt(rc.cajaRuta) : "—"}</td>
                          <td className="col-num">{fmt(rc?.inversiones ?? ra?.inversiones ?? 0)}</td>
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
                          <td className="col-num">{fmt(ra?.capitalRuta ?? 0)}</td>
                          <td className="col-num">{rc ? fmt(rc.capitalRuta) : "—"}</td>
                          <td className="col-num">{fmt(rc?.ganancias ?? ra?.ganancias ?? 0)}</td>
                          <td className="col-num">{fmt(gastosPeriodoRuta(rc, ra))}</td>
                          <td className="col-num">{fmt(rc?.perdidas ?? ra?.perdidas ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {rutaIdsComparar.length > 1 &&
                    (() => {
                      const totAp = ap ? calcularTotales(ap.rutas) : null;
                      const totCi = ci ? calcularTotales(ci.rutas) : null;
                      return (
                        <tfoot>
<<<<<<< HEAD
                          <tr className="resumen-comparar-total-row">
                            <td className="resumen-col-ruta">TOTAL</td>
=======
                          <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                            <td>TOTAL</td>
                            <td className="col-num">{fmt(totAp?.cajaRuta ?? 0)}</td>
                            <td className="col-num">{totCi ? fmt(totCi.cajaRuta) : "—"}</td>
                            <td className="col-num">{fmt(totCi?.inversiones ?? totAp?.inversiones ?? 0)}</td>
>>>>>>> a2873a2ea2970ed873aafa7d79d50c188a979af7
                            <td className="col-num">{fmt(totAp?.capitalRuta ?? 0)}</td>
                            <td className="col-num">{totCi ? fmt(totCi.capitalRuta) : "—"}</td>
                            <td className="col-num">{fmt(totCi?.ganancias ?? totAp?.ganancias ?? 0)}</td>
                            <td className="col-num">{fmt(totCi?.gastosTotales ?? totAp?.gastosTotales ?? 0)}</td>
                            <td className="col-num">{fmt(totCi?.perdidas ?? totAp?.perdidas ?? 0)}</td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                </table>
              </div>
            </>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Sin datos.</p>
          )}
        </div>
      )}
    </>
  );
}
