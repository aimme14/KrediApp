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

/** Periodos guardados antes de incluir `admin.gananciasRutas`: se deriva de las rutas del snapshot. */
function gananciasRutasAdmin(s: PeriodoAdminSnapshot) {
  const g = s.admin.gananciasRutas;
  if (typeof g === "number") return g;
  return s.rutas.reduce((sum, r) => sum + r.ganancias, 0);
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
                  <th>Id</th>
                  <th>Estado</th>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>{p.id}</td>
                    <td>{p.estado === "abierto" ? "Abierto" : "Cerrado"}</td>
                    <td>{p.fechaApertura ? new Date(p.fechaApertura).toLocaleString("es-CO") : "—"}</td>
                    <td>{p.fechaCierre ? new Date(p.fechaCierre).toLocaleString("es-CO") : "—"}</td>
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
              <h4 style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Administrador</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th className="col-num">Apertura</th>
                      <th className="col-num">Cierre</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Caja admin</td>
                      <td className="col-num">{fmt(ap.admin.cajaAdmin)}</td>
                      <td className="col-num">{ci ? fmt(ci.admin.cajaAdmin) : "—"}</td>
                    </tr>
                    <tr>
                      <td>Capital admin</td>
                      <td className="col-num">{fmt(ap.admin.capitalAdmin)}</td>
                      <td className="col-num">{ci ? fmt(ci.admin.capitalAdmin) : "—"}</td>
                    </tr>
                    <tr>
                      <td>Ganancias (suma rutas)</td>
                      <td className="col-num">{fmt(gananciasRutasAdmin(ap))}</td>
                      <td className="col-num">{ci ? fmt(gananciasRutasAdmin(ci)) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>Rutas</h4>
              {rutaIdsComparar.map((rid) => {
                const ra = ap.rutas.find((r) => r.rutaId === rid);
                const rc = ci?.rutas.find((r) => r.rutaId === rid);
                const nombre = ra?.nombre ?? rc?.nombre ?? rid;
                const z = (x: typeof ra) => ({
                  cajaRuta: x?.cajaRuta ?? 0,
                  inversiones: x?.inversiones ?? 0,
                  ganancias: x?.ganancias ?? 0,
                  perdidas: x?.perdidas ?? 0,
                  gastos: x?.gastos ?? 0,
                  capitalRuta: x?.capitalRuta ?? 0,
                  utilidad: x?.utilidad ?? 0,
                });
                const a = z(ra);
                const c = ci ? z(rc) : null;
                const rows: [string, number, number | null][] = [
                  ["Base ruta (caja)", a.cajaRuta, c?.cajaRuta ?? null],
                  ["Inversiones", a.inversiones, c?.inversiones ?? null],
                  ["Ganancias", a.ganancias, c?.ganancias ?? null],
                  ["Pérdidas", a.perdidas, c?.perdidas ?? null],
                  ["Gastos (ruta)", a.gastos, c?.gastos ?? null],
                  ["Capital ruta", a.capitalRuta, c?.capitalRuta ?? null],
                  ["Utilidad", a.utilidad, c?.utilidad ?? null],
                ];
                return (
                  <div key={rid} style={{ marginBottom: "1.25rem" }}>
                    <p style={{ fontWeight: 600, marginBottom: "0.35rem" }}>{nombre}</p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th className="col-num">Apertura</th>
                            <th className="col-num">Cierre</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(([label, av, cv]) => (
                            <tr key={label}>
                              <td>{label}</td>
                              <td className="col-num">{fmt(av)}</td>
                              <td className="col-num">{cv === null ? "—" : fmt(cv)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Sin datos.</p>
          )}
        </div>
      )}
    </>
  );
}
