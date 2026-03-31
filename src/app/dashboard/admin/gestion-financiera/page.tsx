"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getCajaAdmin,
  getResumenEconomico,
  invertirEnCajaRuta,
  listGastos,
  listInversionesCajaRuta,
  type GastoItem,
  type InversionCajaRutaItem,
  type ResumenRutaItem,
} from "@/lib/empresa-api";

function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Formato numérico sin prefijo (paneles gf-*, alineado con vista jefe) */
function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFechaHora(iso: string | null): string {
  if (!iso) return "No registrada";
  const d = new Date(iso);
  return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

type SeccionAdmin = "capital" | "caja" | "gastos";

function parseMontoInvertir(value: string): { num: number; valid: boolean } {
  const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(raw);
  if (raw === "" || Number.isNaN(num)) return { num: 0, valid: false };
  if (num <= 0) return { num, valid: false };
  return { num, valid: true };
}

export default function GestionFinancieraPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cajaAdmin, setCajaAdmin] = useState(0);
  const [capitalAdmin, setCapitalAdmin] = useState(0);
  const [rutas, setRutas] = useState<ResumenRutaItem[]>([]);
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [seccionActiva, setSeccionActiva] = useState<SeccionAdmin>("capital");

  const [invertirRutaId, setInvertirRutaId] = useState("");
  const [invertirMonto, setInvertirMonto] = useState("");
  const [invertirSaving, setInvertirSaving] = useState(false);
  const [invertirError, setInvertirError] = useState<string | null>(null);
  const [invertirOk, setInvertirOk] = useState(false);
  const [inversiones, setInversiones] = useState<InversionCajaRutaItem[]>([]);

  const load = useCallback(async () => {
    if (!user || !profile || profile.role !== "admin") return;

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [caja, resumen, listaGastos] = await Promise.all([
        getCajaAdmin(token),
        getResumenEconomico(token),
        listGastos(token),
      ]);
      setCajaAdmin(caja);
      setCapitalAdmin(resumen.capitalAdmin ?? 0);
      setRutas(resumen.rutas ?? []);
      setGastos(listaGastos ?? []);
      try {
        const listaInversiones = await listInversionesCajaRuta(token);
        setInversiones(listaInversiones ?? []);
      } catch {
        setInversiones([]);
      }
      setLastLoadedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar gestión financiera");
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    load();
  }, [load]);

  const totalGastos = useMemo(() => rutas.reduce((sum, r) => sum + (r.gastos ?? 0), 0), [rutas]);

  const rutasPropias = useMemo(
    () => (user ? rutas.filter((r) => r.adminId === user.uid) : []),
    [rutas, user]
  );

  const sumaCapitalRutas = useMemo(
    () => rutasPropias.reduce((sum, r) => sum + (r.capitalRuta ?? 0), 0),
    [rutasPropias]
  );

  const handleInvertirEnRuta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "admin") return;
    setInvertirError(null);
    setInvertirOk(false);
    if (!invertirRutaId.trim()) {
      setInvertirError("Selecciona una ruta.");
      return;
    }
    const { num, valid } = parseMontoInvertir(invertirMonto);
    if (!valid) {
      setInvertirError("Ingresa un monto válido mayor a 0.");
      return;
    }
    if (num > cajaAdmin) {
      setInvertirError("No tienes suficiente caja disponible.");
      return;
    }
    setInvertirSaving(true);
    try {
      const token = await user.getIdToken();
      await invertirEnCajaRuta(token, { rutaId: invertirRutaId.trim(), monto: num });
      setInvertirMonto("");
      setInvertirOk(true);
      await load();
      setTimeout(() => setInvertirOk(false), 3200);
    } catch (err) {
      setInvertirError(err instanceof Error ? err.message : "Error al invertir");
    } finally {
      setInvertirSaving(false);
    }
  };

  const rutaNombrePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rutas) m.set(r.rutaId, r.nombre);
    return m;
  }, [rutas]);

  const chartPointsCapital =
    capitalAdmin > 0 ? [capitalAdmin * 0.98, capitalAdmin] : [0, 0];
  const chartPointsCaja = cajaAdmin > 0 ? [cajaAdmin * 0.98, cajaAdmin] : [0, 0];

  const gastosOrdenados = useMemo(() => {
    return [...gastos].sort((a, b) => {
      const fa = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fb = b.fecha ? new Date(b.fecha).getTime() : 0;
      return fb - fa;
    });
  }, [gastos]);

  if (!profile || profile.role !== "admin") return null;

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Gestión financiera</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Caja del administrador, capital y total de gastos por ruta.
        </p>

        {error && <p className="error-msg">{error}</p>}

        {loading ? (
          <p>Cargando gestión...</p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px" }}>
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Caja admin</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>
                  {formatMoneda(cajaAdmin)}
                </div>
              </div>

              <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px" }}>
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Capital</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>
                  {formatMoneda(capitalAdmin)}
                </div>
              </div>

              <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px" }}>
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Total gastos</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>
                  {formatMoneda(totalGastos)}
                </div>
              </div>
            </div>

            {rutas.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No hay rutas registradas.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ruta</th>
                      <th className="col-num">Capital</th>
                      <th className="col-num">Caja</th>
                      <th className="col-num">Inversiones</th>
                      <th className="col-num">Gastos</th>
                      <th className="col-num">Pérdidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rutas.map((r) => (
                      <tr key={r.rutaId}>
                        <td>{r.nombre}</td>
                        <td className="col-num">{formatMoneda(r.capitalRuta ?? 0)}</td>
                        <td className="col-num">{formatMoneda(r.cajaRuta ?? 0)}</td>
                        <td className="col-num">{formatMoneda(r.inversion ?? 0)}</td>
                        <td className="col-num">{formatMoneda(r.gastos ?? 0)}</td>
                        <td className="col-num">{formatMoneda(r.perdidas ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && (
        <div className="gestion-financiera-page" style={{ marginTop: "1.5rem" }}>
          <nav className="gf-tabs" role="tablist" aria-label="Detalle financiero del administrador">
            <button
              type="button"
              role="tab"
              aria-selected={seccionActiva === "capital"}
              aria-controls="gf-admin-panel-capital"
              id="gf-admin-tab-capital"
              className={`gf-tab ${seccionActiva === "capital" ? "gf-tab-active" : ""}`}
              onClick={() => setSeccionActiva("capital")}
            >
              <span className="gf-tab-icon" aria-hidden>
                💰
              </span>
              Capital
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={seccionActiva === "caja"}
              aria-controls="gf-admin-panel-caja"
              id="gf-admin-tab-caja"
              className={`gf-tab ${seccionActiva === "caja" ? "gf-tab-active" : ""}`}
              onClick={() => setSeccionActiva("caja")}
            >
              <span className="gf-tab-icon" aria-hidden>
                🏦
              </span>
              Caja
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={seccionActiva === "gastos"}
              aria-controls="gf-admin-panel-gastos"
              id="gf-admin-tab-gastos"
              className={`gf-tab ${seccionActiva === "gastos" ? "gf-tab-active" : ""}`}
              onClick={() => setSeccionActiva("gastos")}
            >
              <span className="gf-tab-icon" aria-hidden>
                📋
              </span>
              Gastos
            </button>
          </nav>

          <div
            id="gf-admin-panel-capital"
            role="tabpanel"
            aria-labelledby="gf-admin-tab-capital"
            hidden={seccionActiva !== "capital"}
            className="gf-panel"
          >
            <div className="gf-capital-card card">
              <div className="gf-capital-card-header">
                <div className="gf-capital-card-title-wrap">
                  <span className="gf-capital-icon" aria-hidden>
                    🏢
                  </span>
                  <h2 className="gf-capital-card-title">Capital del administrador</h2>
                </div>
                <span className="gf-capital-badge-privado">🔒 Privado</span>
              </div>
              <p className="gf-capital-card-desc">
                Solo tú ves estos montos. El capital total incluye tu caja, el capital asignado a rutas y
                descuenta los gastos registrados (generales y por ruta).
              </p>

              <div className="gf-capital-display">
                <span className="gf-capital-label">CAPITAL TOTAL</span>
                <span className="gf-capital-monto" aria-live="polite">
                  ${formatMonto(capitalAdmin)}
                </span>
                <div className="gf-capital-desglose gf-capital-desglose-dos">
                  <span>Caja admin: {formatMonto(cajaAdmin)}</span>
                  <span>Σ capital rutas: {formatMonto(sumaCapitalRutas)}</span>
                </div>
                <div className="gf-capital-indicators">
                  <span className="gf-capital-indicator">
                    <span className="gf-capital-indicator-icon" aria-hidden>
                      🕐
                    </span>
                    Datos actualizados: {lastLoadedAt ? formatFechaHora(lastLoadedAt) : "—"}
                  </span>
                  <span className="gf-capital-tendencia gf-tendencia-estable">
                    <span className="gf-capital-indicator-icon" aria-hidden>
                      📊
                    </span>
                    Tendencia: Estable
                  </span>
                </div>
                <div className="gf-mini-chart" role="img" aria-label="Referencia de capital">
                  <MiniChart points={chartPointsCapital} />
                </div>
              </div>
            </div>

            <div className="gf-historial-card card">
              <div className="gf-historial-header">
                <h2 className="gf-historial-title">
                  <span className="gf-historial-icon" aria-hidden>
                    🕐
                  </span>
                  HISTORIAL DE CAMBIOS
                </h2>
              </div>
              <p className="gf-historial-empty">
                El historial detallado de ajustes de capital está en la vista del jefe. Aquí ves el
                capital calculado en tiempo real.
              </p>
            </div>
          </div>

          <div
            id="gf-admin-panel-caja"
            role="tabpanel"
            aria-labelledby="gf-admin-tab-caja"
            hidden={seccionActiva !== "caja"}
            className="gf-panel"
          >
            <div className="gf-capital-card card">
              <div className="gf-capital-card-header">
                <div className="gf-capital-card-title-wrap">
                  <span className="gf-capital-icon" aria-hidden>
                    🏦
                  </span>
                  <h2 className="gf-capital-card-title">Caja del administrador</h2>
                </div>
                <span className="gf-capital-badge-privado">🔒 Privado</span>
              </div>
              <p className="gf-capital-card-desc">
                Liquidez disponible en tu caja antes de distribuir a rutas u operaciones. Los movimientos se
                registran al crear rutas, préstamos o gastos según las reglas del sistema.
              </p>

              <div className="gf-capital-display">
                <span className="gf-capital-label">CAJA TOTAL</span>
                <span className="gf-capital-monto" aria-live="polite">
                  ${formatMonto(cajaAdmin)}
                </span>
                <div className="gf-capital-desglose gf-capital-desglose-dos">
                  <span>Capital admin: {formatMonto(capitalAdmin)}</span>
                  <span>Σ capital rutas: {formatMonto(sumaCapitalRutas)}</span>
                </div>
                <div className="gf-capital-indicators">
                  <span className="gf-capital-indicator">
                    <span className="gf-capital-indicator-icon" aria-hidden>
                      🕐
                    </span>
                    Datos actualizados: {lastLoadedAt ? formatFechaHora(lastLoadedAt) : "—"}
                  </span>
                  <span className="gf-capital-tendencia gf-tendencia-estable">
                    <span className="gf-capital-indicator-icon" aria-hidden>
                      📊
                    </span>
                    Tendencia: Estable
                  </span>
                </div>
                <p className="gf-caja-chart-note">Referencia visual (sin serie histórica en administrador)</p>
                <div className="gf-mini-chart" role="img" aria-label="Referencia de caja">
                  <MiniChart points={chartPointsCaja} />
                </div>
              </div>
            </div>

            <div className="gf-salidas-card card">
              <div className="gf-salidas-header">
                <span className="gf-salidas-icon" aria-hidden>
                  📥
                </span>
                <h2 className="gf-salidas-title">Invertir en caja de ruta</h2>
              </div>
              <p className="gf-salidas-desc">
                Transfiere dinero desde tu caja de administrador hacia la <strong>caja de la ruta</strong>{" "}
                (liquidez disponible en esa ruta). El capital total de la ruta aumenta en el mismo monto.
              </p>
              <p style={{ marginBottom: "1rem", fontWeight: 600 }}>Tu caja disponible: {formatMonto(cajaAdmin)}</p>

              {rutasPropias.length === 0 ? (
                <p className="gf-salidas-empty">No tienes rutas asignadas aún. Crea una ruta primero.</p>
              ) : (
                <form onSubmit={handleInvertirEnRuta} className="gf-capital-form" style={{ maxWidth: "22rem" }}>
                  <label htmlFor="gf-invertir-ruta" className="gf-capital-form-label">
                    RUTA
                  </label>
                  <select
                    id="gf-invertir-ruta"
                    className="gf-capital-input"
                    style={{ width: "100%", maxWidth: "22rem", padding: "0.65rem 0.75rem" }}
                    value={invertirRutaId}
                    onChange={(e) => {
                      setInvertirRutaId(e.target.value);
                      setInvertirError(null);
                    }}
                    disabled={invertirSaving}
                    required
                  >
                    <option value="">— selecciona —</option>
                    {rutasPropias.map((r) => (
                      <option key={r.rutaId} value={r.rutaId}>
                        {r.nombre} (caja ruta: {formatMonto(r.cajaRuta ?? 0)})
                      </option>
                    ))}
                  </select>

                  <label htmlFor="gf-invertir-monto" className="gf-capital-form-label gf-capital-form-label-second">
                    MONTO A INVERTIR
                  </label>
                  <div className="gf-capital-input-wrap">
                    <span className="gf-capital-input-prefix">COP $</span>
                    <input
                      id="gf-invertir-monto"
                      type="text"
                      inputMode="decimal"
                      value={invertirMonto}
                      onChange={(e) => {
                        setInvertirMonto(e.target.value);
                        setInvertirError(null);
                      }}
                      placeholder="Ej. 500000"
                      className={`gf-capital-input ${invertirError ? "gf-capital-input-error" : ""}`}
                      disabled={invertirSaving}
                      autoComplete="off"
                    />
                  </div>
                  {invertirError && (
                    <p className="gf-capital-input-msg-error" role="alert">
                      {invertirError}
                    </p>
                  )}
                  {invertirOk && (
                    <p className="gf-msg" style={{ color: "#22c55e", fontSize: "0.875rem" }}>
                      Inversión aplicada correctamente.
                    </p>
                  )}
                  <button type="submit" className="gf-btn-actualizar" disabled={invertirSaving}>
                    {invertirSaving ? "Aplicando…" : "Invertir en la ruta"}
                  </button>
                </form>
              )}
            </div>

            <div className="gf-historial-card card" style={{ marginTop: "1rem" }}>
              <div className="gf-historial-header">
                <h2 className="gf-historial-title">
                  <span className="gf-historial-icon" aria-hidden>
                    📒
                  </span>
                  Historial de inversiones en caja de ruta
                </h2>
              </div>
              {inversiones.length === 0 ? (
                <p className="gf-historial-empty">Aún no hay inversiones registradas.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ruta</th>
                        <th className="col-num">Monto invertido</th>
                        <th>Fecha</th>
                        <th>Quién invirtió</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inversiones.map((inv) => (
                        <tr key={inv.id}>
                          <td>{inv.rutaNombre?.trim() ? inv.rutaNombre : inv.rutaId}</td>
                          <td className="col-num">{formatMoneda(inv.monto)}</td>
                          <td>{inv.fecha ? formatFechaCorta(inv.fecha) : "—"}</td>
                          <td>{inv.invertidoPorNombre || inv.invertidoPorUid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div
            id="gf-admin-panel-gastos"
            role="tabpanel"
            aria-labelledby="gf-admin-tab-gastos"
            hidden={seccionActiva !== "gastos"}
            className="gf-panel"
          >
            <div className="gf-capital-card card">
              <div className="gf-capital-card-header">
                <div className="gf-capital-card-title-wrap">
                  <span className="gf-capital-icon" aria-hidden>
                    📋
                  </span>
                  <h2 className="gf-capital-card-title">Gastos del administrador</h2>
                </div>
                <span className="gf-capital-badge-privado">🔒 Privado</span>
              </div>
              <p className="gf-capital-card-desc">
                Total de gastos asociados a tu usuario (por ruta y generales). Para registrar un gasto nuevo
                usa la sección Gastos del menú.
              </p>

              <div className="gf-capital-display">
                <span className="gf-capital-label">TOTAL GASTOS</span>
                <span className="gf-capital-monto" aria-live="polite">
                  ${formatMonto(totalGastos)}
                </span>
              </div>
            </div>

            <div className="gf-historial-card card">
              <div className="gf-historial-header">
                <h2 className="gf-historial-title">
                  <span className="gf-historial-icon" aria-hidden>
                    🕐
                  </span>
                  REGISTROS RECIENTES
                </h2>
              </div>
              {gastosOrdenados.length === 0 ? (
                <p className="gf-historial-empty">No hay gastos registrados.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="col-num">Monto</th>
                        <th>Fecha</th>
                        <th>Motivo</th>
                        <th>Quién lo realizó</th>
                        <th>Ruta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastosOrdenados.map((g, i) => {
                        const rutaLabel = g.rutaId?.trim()
                          ? rutaNombrePorId.get(g.rutaId) ?? `Ruta ${g.rutaId.slice(0, 8)}…`
                          : "Gasto general";
                        const quien =
                          (g.creadoPorNombre && String(g.creadoPorNombre).trim()) ||
                          (g.creadoPor === user?.uid
                            ? profile?.displayName?.trim() ||
                              profile?.email ||
                              user?.email ||
                              "Tú"
                            : (g.creadoPor && String(g.creadoPor)) || "—");
                        const motivoText = g.descripcion?.trim() || "—";
                        const motivo = g.tipo ? `${motivoText} (${g.tipo})` : motivoText;
                        return (
                          <tr key={`${g.id}-${g.alcance ?? i}`}>
                            <td className="col-num">{formatMoneda(g.monto)}</td>
                            <td>{g.fecha ? formatFechaCorta(g.fecha) : "—"}</td>
                            <td>{motivo}</td>
                            <td>{quien}</td>
                            <td>{rutaLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MiniChart({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 200;
  const h = 64;
  const padding = 4;
  const xs = points.map((_, i) => padding + (i / Math.max(points.length - 1, 1)) * (w - 2 * padding));
  const ys = points.map((v) => h - padding - ((v - min) / range) * (h - 2 * padding));
  const pathD = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="gf-mini-chart-svg">
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
