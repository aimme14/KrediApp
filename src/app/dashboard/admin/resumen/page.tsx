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

function fmtDelta(apertura: number, cierre: number | null): {
  texto: string;
  positivo: boolean;
  neutro: boolean;
} {
  if (cierre === null) return { texto: "—", positivo: false, neutro: true };
  const diff = cierre - apertura;
  const signo = diff > 0 ? "+" : "";
  return {
    texto: `${signo}${fmt(diff)}`,
    positivo: diff > 0,
    neutro: diff === 0,
  };
}

function calcularTotales(rutas: PeriodoAdminSnapshotRuta[]) {
  return rutas.reduce(
    (acc, r) => ({
      cajaRuta: acc.cajaRuta + r.cajaRuta,
      inversiones: acc.inversiones + r.inversiones,
      ganancias: acc.ganancias + r.ganancias,
      perdidas: acc.perdidas + r.perdidas,
      gastos: acc.gastos + r.gastos,
      capitalRuta: acc.capitalRuta + r.capitalRuta,
      utilidad: acc.utilidad + r.utilidad,
    }),
    { cajaRuta: 0, inversiones: 0, ganancias: 0, perdidas: 0, gastos: 0, capitalRuta: 0, utilidad: 0 }
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
        <h3 style={{ marginTop: 0 }}>Periodos contables</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        </p>

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
        <div
          className="card"
          style={{ marginTop: "1rem", position: "relative" }}
          role="dialog"
          aria-label="Comparación de periodo"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>Comparación apertura / cierre</h3>
            <button type="button" className="btn btn-secondary" onClick={() => setDetalle(null)} disabled={detalleLoading}>
              Cerrar
            </button>
          </div>
          {detalleLoading ? (
            <p>Cargando...</p>
          ) : detalle && ap ? (
            <>
              <h4 style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>Rutas</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ruta</th>
                      <th className="col-num">Capital apertura</th>
                      <th className="col-num">Capital cierre</th>
                      <th className="col-num">Variación</th>
                      <th className="col-num">Ganancias</th>
                      <th className="col-num">Gastos</th>
                      <th className="col-num">Pérdidas</th>
                      <th className="col-num">Utilidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rutaIdsComparar.map((rid) => {
                      const ra = ap.rutas.find((r) => r.rutaId === rid);
                      const rc = ci?.rutas.find((r) => r.rutaId === rid);
                      const nombre = ra?.nombre ?? rc?.nombre ?? rid;
                      const delta = fmtDelta(ra?.capitalRuta ?? 0, rc?.capitalRuta ?? null);
                      return (
                        <tr key={rid}>
                          <td>{nombre}</td>
                          <td className="col-num">{fmt(ra?.capitalRuta ?? 0)}</td>
                          <td className="col-num">{rc ? fmt(rc.capitalRuta) : "—"}</td>
                          <td
                            className="col-num"
                            style={{
                              color: delta.neutro
                                ? "var(--text-muted)"
                                : delta.positivo
                                  ? "var(--success, #16a34a)"
                                  : "var(--danger, #dc2626)",
                              fontWeight: 600,
                            }}
                          >
                            {delta.texto}
                          </td>
                          <td className="col-num">{fmt(rc?.ganancias ?? ra?.ganancias ?? 0)}</td>
                          <td className="col-num">{fmt(rc?.gastos ?? ra?.gastos ?? 0)}</td>
                          <td className="col-num">{fmt(rc?.perdidas ?? ra?.perdidas ?? 0)}</td>
                          <td
                            className="col-num"
                            style={{
                              fontWeight: 600,
                              color:
                                (rc?.utilidad ?? ra?.utilidad ?? 0) >= 0
                                  ? "var(--success, #16a34a)"
                                  : "var(--danger, #dc2626)",
                            }}
                          >
                            {fmt(rc?.utilidad ?? ra?.utilidad ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {rutaIdsComparar.length > 1 &&
                    (() => {
                      const totAp = ap ? calcularTotales(ap.rutas) : null;
                      const totCi = ci ? calcularTotales(ci.rutas) : null;
                      const deltaTotal = fmtDelta(totAp?.capitalRuta ?? 0, totCi?.capitalRuta ?? null);
                      return (
                        <tfoot>
                          <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                            <td>TOTAL</td>
                            <td className="col-num">{fmt(totAp?.capitalRuta ?? 0)}</td>
                            <td className="col-num">{totCi ? fmt(totCi.capitalRuta) : "—"}</td>
                            <td
                              className="col-num"
                              style={{
                                color: deltaTotal.neutro
                                  ? "var(--text-muted)"
                                  : deltaTotal.positivo
                                    ? "var(--success, #16a34a)"
                                    : "var(--danger, #dc2626)",
                              }}
                            >
                              {deltaTotal.texto}
                            </td>
                            <td className="col-num">{fmt(totCi?.ganancias ?? totAp?.ganancias ?? 0)}</td>
                            <td className="col-num">{fmt(totCi?.gastos ?? totAp?.gastos ?? 0)}</td>
                            <td className="col-num">{fmt(totCi?.perdidas ?? totAp?.perdidas ?? 0)}</td>
                            <td
                              className="col-num"
                              style={{
                                fontWeight: 700,
                                color:
                                  (totCi?.utilidad ?? totAp?.utilidad ?? 0) >= 0
                                    ? "var(--success, #16a34a)"
                                    : "var(--danger, #dc2626)",
                              }}
                            >
                              {fmt(totCi?.utilidad ?? totAp?.utilidad ?? 0)}
                            </td>
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
