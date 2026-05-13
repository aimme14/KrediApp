"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getCajaAdmin,
  getResumenEconomico,
  invertirEnCajaRuta,
  listInversionesCajaRuta,
  type InversionCajaRutaItem,
  type ResumenRutaItem,
} from "@/lib/empresa-api";
import { formatMontoEnteroInput } from "@/lib/monto-input-es";
import { MiniChart } from "@/components/admin/MiniChart";

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
  const [rutas, setRutas] = useState<ResumenRutaItem[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

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
      const [caja, resumen] = await Promise.all([getCajaAdmin(token), getResumenEconomico(token)]);
      setCajaAdmin(caja);
      setRutas(resumen.rutas ?? []);
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

  const rutasPropias = useMemo(
    () => (user ? rutas.filter((r) => r.adminId === user.uid) : []),
    [rutas, user]
  );

  const sumaBaseRutasPropias = useMemo(
    () => rutasPropias.reduce((sum, r) => sum + (r.cajaRuta ?? 0), 0),
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
      setInvertirError("No tienes suficiente base disponible.");
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

  const chartPointsCaja = cajaAdmin > 0 ? [cajaAdmin * 0.98, cajaAdmin] : [0, 0];

  if (!profile || profile.role !== "admin") return null;

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Gestión financiera</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Base del administrador e inversiones en la base de cada ruta. El capital y el detalle de gastos
          operativos están en Inicio y en Gastos operativos del menú.
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
              <div className="card" style={{ padding: "1rem", margin: 0, flex: "1 1 220px", maxWidth: "320px" }}>
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Base admin</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginTop: "0.25rem" }}>
                  {formatMoneda(cajaAdmin)}
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
                      <th className="col-num">Base</th>
                      <th className="col-num">Inversiones</th>
                      <th className="col-num">Pérdidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rutas.map((r) => (
                      <tr key={r.rutaId}>
                        <td>{r.nombre}</td>
                        <td className="col-num">{formatMoneda(r.cajaRuta ?? 0)}</td>
                        <td className="col-num">{formatMoneda(r.inversion ?? 0)}</td>
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
          <div className="gf-panel" aria-label="Base del administrador">
            <div className="gf-capital-card card">
              <div className="gf-capital-card-header">
                <div className="gf-capital-card-title-wrap">
                  <span className="gf-capital-icon" aria-hidden>
                    🏦
                  </span>
                  <h2 className="gf-capital-card-title">Base del administrador</h2>
                </div>
                <span className="gf-capital-badge-privado">🔒 Privado</span>
              </div>
              <p className="gf-capital-card-desc">
                Liquidez disponible en tu base antes de distribuir a rutas u operaciones. Los movimientos se
                registran al crear rutas, préstamos o gastos según las reglas del sistema.
              </p>

              <div className="gf-capital-display">
                <span className="gf-capital-label">BASE TOTAL</span>
                <span className="gf-capital-monto" aria-live="polite">
                  ${formatMonto(cajaAdmin)}
                </span>
                <div className="gf-capital-desglose gf-capital-desglose-dos">
                  <span>Σ base en tus rutas: {formatMonto(sumaBaseRutasPropias)}</span>
                  <span>Rutas asignadas: {rutasPropias.length}</span>
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
                <div className="gf-mini-chart" role="img" aria-label="Referencia de base">
                  <MiniChart points={chartPointsCaja} />
                </div>
              </div>
            </div>

            <div className="gf-salidas-card card">
              <div className="gf-salidas-header">
                <span className="gf-salidas-icon" aria-hidden>
                  📥
                </span>
                <h2 className="gf-salidas-title">Invertir en base de ruta</h2>
              </div>
              <p className="gf-salidas-desc">
                Transfiere dinero desde tu base de administrador hacia la <strong>base de la ruta</strong>{" "}
                (liquidez disponible en esa ruta).
              </p>
              <p style={{ marginBottom: "1rem", fontWeight: 600 }}>Tu base disponible: {formatMonto(cajaAdmin)}</p>

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
                        {r.nombre} (base ruta: {formatMonto(r.cajaRuta ?? 0)})
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
                        setInvertirMonto(formatMontoEnteroInput(e.target.value));
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
                  Historial de inversiones en base de ruta
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
        </div>
      )}
    </>
  );
}
