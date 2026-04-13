"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getResumenEconomico,
  getCierresMensuales,
  getCierreMensual,
  crearCierreMensual,
  type ResumenRutaItem,
  type CierreMensualItem,
  type CierreMensualDetalle,
} from "@/lib/empresa-api";

export default function ResumenPage() {
  const { user, profile } = useAuth();
  const [rutas, setRutas] = useState<ResumenRutaItem[]>([]);
  const [utilidadGlobal, setUtilidadGlobal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cierres, setCierres] = useState<CierreMensualItem[]>([]);
  const [cierresLoading, setCierresLoading] = useState(false);
  const [cierreDetalle, setCierreDetalle] = useState<CierreMensualDetalle | null>(null);
  const [creandoCierre, setCreandoCierre] = useState(false);

  const loadResumen = useCallback(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    user.getIdToken().then((token) => {
      getResumenEconomico(token)
        .then((res) => {
          setRutas(res.rutas);
          setUtilidadGlobal(res.utilidadGlobal);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar resumen"))
        .finally(() => setLoading(false));
    });
  }, [user]);

  const loadCierres = useCallback(() => {
    if (!user) return;
    setCierresLoading(true);
    user.getIdToken().then((token) => {
      getCierresMensuales(token)
        .then(setCierres)
        .catch(() => setCierres([]))
        .finally(() => setCierresLoading(false));
    });
  }, [user]);

  useEffect(() => {
    loadResumen();
  }, [loadResumen]);

  useEffect(() => {
    loadCierres();
  }, [loadCierres]);

  const handleCrearCierre = () => {
    if (!user) return;
    setCreandoCierre(true);
    user.getIdToken().then((token) => {
      crearCierreMensual(token)
        .then(() => {
          loadCierres();
          loadResumen();
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Error al crear cierre"))
        .finally(() => setCreandoCierre(false));
    });
  };

  const handleVerCierre = (periodo: string) => {
    if (!user) return;
    user.getIdToken().then((token) => {
      getCierreMensual(token, periodo).then(setCierreDetalle);
    });
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Resumen Económico</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Tabla por ruta: ingreso, egreso, gastos, salidas, inversión, ganancias (bolsa) y utilidad.
        </p>
        {!loading && rutas.length > 0 && (
          <p style={{ fontWeight: 600, marginBottom: "1rem" }}>
            Utilidad global: {utilidadGlobal.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        )}

        {error && <p className="error-msg">{error}</p>}

        {loading ? (
          <p>Cargando resumen...</p>
        ) : rutas.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay rutas. Crea rutas en la sección Rutas para ver el resumen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ruta</th>
                  <th>Ubicación</th>
                  <th className="col-num">Ingreso</th>
                  <th className="col-num">Egreso</th>
                  <th className="col-num">Gastos</th>
                  <th className="col-num">Salidas</th>
                  <th className="col-num">Inversión</th>
                  <th className="col-num">Ganancias</th>
                  <th className="col-num">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {rutas.map((r) => (
                  <tr key={r.rutaId}>
                    <td>{r.nombre}</td>
                    <td>{r.ubicacion || "—"}</td>
                    <td className="col-num">{r.ingreso.toFixed(2)}</td>
                    <td className="col-num">{r.egreso.toFixed(2)}</td>
                    <td className="col-num">{r.gastos.toFixed(2)}</td>
                    <td className="col-num">{r.salidas.toFixed(2)}</td>
                    <td className="col-num">{r.inversion.toFixed(2)}</td>
                    <td className="col-num">{r.ganancias.toFixed(2)}</td>
                    <td className="col-num">{r.utilidad.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ marginTop: 0 }}>Cierres mensuales</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Guarda una foto del estado por ruta al cierre del mes. Utilidad global y detalle por ruta.
        </p>
        <div style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCrearCierre}
            disabled={creandoCierre || cierresLoading}
          >
            {creandoCierre ? "Creando cierre..." : "Cerrar mes actual"}
          </button>
        </div>
        {cierresLoading ? (
          <p>Cargando cierres...</p>
        ) : cierres.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay cierres. Usa &quot;Cerrar mes actual&quot; para generar uno.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Fecha cierre</th>
                  <th className="col-num">Utilidad global</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cierres.map((c) => (
                  <tr key={c.periodo}>
                    <td>{c.periodo}</td>
                    <td>{c.fechaCierre ? new Date(c.fechaCierre).toLocaleDateString("es-CO") : "—"}</td>
                    <td className="col-num">{(c.utilidadGlobal ?? 0).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
                        onClick={() => handleVerCierre(c.periodo)}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cierreDetalle && (
        <div
          className="card"
          style={{ marginTop: "1rem", position: "relative" }}
          role="dialog"
          aria-label="Detalle del cierre"
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>
              Cierre {cierreDetalle.periodo}
              {cierreDetalle.fechaCierre && (
                <span style={{ fontWeight: "normal", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  {" "}
                  — {new Date(cierreDetalle.fechaCierre).toLocaleDateString("es-CO")}
                </span>
              )}
            </h3>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCierreDetalle(null)}
            >
              Cerrar
            </button>
          </div>
          {typeof cierreDetalle.utilidadGlobal === "number" && (
            <p style={{ fontWeight: 600, marginBottom: "1rem" }}>
              Utilidad global: {cierreDetalle.utilidadGlobal.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ruta</th>
                  <th className="col-num">Base ruta</th>
                  <th className="col-num">Bases empleados</th>
                  <th className="col-num">Inversiones</th>
                  <th className="col-num">Ganancias</th>
                  <th className="col-num">Pérdidas</th>
                  <th className="col-num">Gastos</th>
                  <th className="col-num">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {cierreDetalle.rutas.map((r) => (
                  <tr key={r.rutaId}>
                    <td>{r.nombre}</td>
                    <td className="col-num">{r.cajaRuta.toFixed(2)}</td>
                    <td className="col-num">{r.cajasEmpleados.toFixed(2)}</td>
                    <td className="col-num">{r.inversiones.toFixed(2)}</td>
                    <td className="col-num">{r.ganancias.toFixed(2)}</td>
                    <td className="col-num">{r.perdidas.toFixed(2)}</td>
                    <td className="col-num">{r.gastos.toFixed(2)}</td>
                    <td className="col-num">{r.utilidad.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
