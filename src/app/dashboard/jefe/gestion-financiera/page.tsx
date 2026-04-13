"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import {
  getCapital,
  setCapital,
  ajustarCapital,
  clearCapitalHistorial,
  invertirCajaJefe,
  type CapitalHistorialEntry,
  type CapitalResponse,
} from "@/lib/capital";
import { listUsersByCreator } from "@/lib/users";
import type { UserProfile } from "@/types/roles";

const MAX_HISTORIAL = 6;
const TOAST_DURATION = 3000;
const BUTTON_SUCCESS_DURATION = 2000;

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

function formatSoloHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

type Tendencia = "subiendo" | "bajando" | "estable";

function getTendencia(historial: CapitalHistorialEntry[]): Tendencia {
  if (historial.length < 2) return "estable";
  const a = historial[0].montoNuevo;
  const b = historial[1].montoNuevo;
  if (a > b) return "subiendo";
  if (a < b) return "bajando";
  return "estable";
}

function getChartPoints(historial: CapitalHistorialEntry[], montoActual: number): number[] {
  if (historial.length === 0) return montoActual > 0 ? [montoActual] : [0];
  const points = [...historial].reverse().map((h) => h.montoNuevo);
  points.push(montoActual);
  return points;
}

/** Aproximación de evolución de base a partir del historial de capital (Σ admins actual). */
function getChartPointsCaja(
  historial: CapitalHistorialEntry[],
  cajaActual: number,
  sumaAdmins: number
): number[] {
  if (historial.length === 0) return cajaActual > 0 ? [cajaActual] : [0];
  const points = [...historial].reverse().map((h) => Math.max(0, h.montoNuevo - sumaAdmins));
  points.push(cajaActual);
  return points;
}

function parseMontoInput(value: string): { num: number; valid: boolean } {
  const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(raw);
  if (raw === "" || Number.isNaN(num)) return { num: 0, valid: false };
  if (num <= 0) return { num, valid: false };
  return { num, valid: true };
}

function parseAjusteInput(value: string): { delta: number; valid: boolean } {
  const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (raw === "" || raw === "-") return { delta: 0, valid: false };
  const num = Number(raw);
  if (Number.isNaN(num)) return { delta: 0, valid: false };
  return { delta: num, valid: true };
}

function sortAdminsPorCodigo(a: UserProfile, b: UserProfile): number {
  const ca = (a.codigo ?? "").toString();
  const cb = (b.codigo ?? "").toString();
  return ca.localeCompare(cb, undefined, { numeric: true });
}

export default function GestionFinancieraPage() {
  const { user, profile } = useAuth();
  const [capital, setCapitalState] = useState<CapitalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [inputValueConfirm, setInputValueConfirm] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputErrorConfirm, setInputErrorConfirm] = useState<string | null>(null);
  const [btnState, setBtnState] = useState<"default" | "saving" | "success">("default");
  const [toast, setToast] = useState<{ tipo: "aumento" | "reduccion"; mensaje: string } | null>(null);
  const [clearingHistorial, setClearingHistorial] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cajaObjetivoPendiente, setCajaObjetivoPendiente] = useState<number | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [formCajaAbierto, setFormCajaAbierto] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState<"capital" | "caja">("capital");
  const [ajusteInput, setAjusteInput] = useState("");
  const [ajusteSaving, setAjusteSaving] = useState(false);
  const [ajusteError, setAjusteError] = useState<string | null>(null);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [invertirDestino, setInvertirDestino] = useState<"" | "empresa" | string>("");
  const [invertirMonto, setInvertirMonto] = useState("");
  const [invertirSaving, setInvertirSaving] = useState(false);
  const [invertirError, setInvertirError] = useState<string | null>(null);

  const adminsOrdenados = useMemo(() => [...admins].sort(sortAdminsPorCodigo), [admins]);

  const loadCapital = useCallback(async () => {
    if (!user || !profile || profile.role !== "jefe") return;
    try {
      const token = await user.getIdToken();
      const data = await getCapital(token);
      setCapitalState(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el capital");
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    loadCapital();
  }, [loadCapital]);

  useEffect(() => {
    if (!profile || profile.role !== "jefe") return;
    let cancelled = false;
    listUsersByCreator(profile.uid, "admin")
      .then((list) => {
        if (!cancelled) setAdmins(list);
      })
      .catch(() => {
        if (!cancelled) setAdmins([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (!modalAbierto) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCerrarModal();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [modalAbierto]);

  const { num: num1, valid: valid1 } = parseMontoInput(inputValue);
  const { num: num2, valid: valid2 } = parseMontoInput(inputValueConfirm);
  const montosCoinciden = valid1 && valid2 && num1 === num2;
  const puedeEnviar = valid1 && valid2 && montosCoinciden && btnState === "default";

  const handleSubmitCaja = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "jefe") return;
    if (!valid1) {
      setInputError(inputValue.trim() === "" ? "Ingresa un monto válido." : "El monto debe ser mayor a 0.");
      return;
    }
    if (!valid2) {
      setInputErrorConfirm(inputValueConfirm.trim() === "" ? "Repite el monto." : "El monto debe ser mayor a 0.");
      return;
    }
    if (num1 !== num2) {
      setInputErrorConfirm("Los montos no coinciden.");
      return;
    }
    setInputError(null);
    setInputErrorConfirm(null);
    setCajaObjetivoPendiente(num1);
    setPasswordValue("");
    setPasswordError(null);
    setModalAbierto(true);
  };

  const handleCerrarModal = () => {
    setModalAbierto(false);
    setCajaObjetivoPendiente(null);
    setPasswordValue("");
    setPasswordError(null);
  };

  const handleConfirmarModal = async () => {
    if (!user || !profile || profile.role !== "jefe" || cajaObjetivoPendiente == null || !auth) return;
    if (!passwordValue.trim()) {
      setPasswordError("Ingresa tu contraseña para confirmar.");
      return;
    }
    setPasswordError(null);
    setIsConfirming(true);
    try {
      const email = profile.email || user.email;
      if (!email) {
        setPasswordError("No se pudo verificar tu cuenta.");
        setIsConfirming(false);
        return;
      }
      const credential = EmailAuthProvider.credential(email, passwordValue);
      await reauthenticateWithCredential(user, credential);
      handleCerrarModal();
      setBtnState("saving");
      const token = await user.getIdToken();
      const suma = sumaCapitalAdmins;
      const montoCapitalObjetivo = cajaObjetivoPendiente + suma;
      const data = await setCapital(token, montoCapitalObjetivo);
      setCapitalState((prev) => ({
        ...prev,
        monto: data.monto,
        capitalEmpresa: data.capitalEmpresa,
        capitalTotal: data.capitalTotal,
        cajaEmpresa: data.cajaEmpresa,
        gastosEmpresa: data.gastosEmpresa,
        sumaCapitalAdmins: data.sumaCapitalAdmins,
        capitalAsignadoAdmins: data.capitalAsignadoAdmins,
        updatedAt: data.updatedAt,
        historial: data.historial,
      }));
      setInputValue("");
      setInputValueConfirm("");
      setBtnState("success");
      const anteriorCaja = capital?.cajaEmpresa ?? 0;
      if (data.cajaEmpresa > anteriorCaja) {
        setToast({ tipo: "aumento", mensaje: "Base de la empresa actualizada correctamente." });
      } else {
        setToast({ tipo: "reduccion", mensaje: "Base de la empresa actualizada." });
      }
      setTimeout(() => setToast(null), TOAST_DURATION);
      setTimeout(() => setBtnState("default"), BUTTON_SUCCESS_DURATION);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al verificar.";
      if (msg.includes("wrong-password") || msg.includes("invalid-credential") || msg.includes("invalid-password")) {
        setPasswordError("Contraseña incorrecta.");
      } else {
        setPasswordError(msg);
      }
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClearHistorial = async () => {
    if (!user || !profile || profile.role !== "jefe") return;
    if (!window.confirm("¿Estás seguro de que quieres limpiar todo el historial de cambios?")) return;
    setClearingHistorial(true);
    try {
      const token = await user.getIdToken();
      await clearCapitalHistorial(token);
      setCapitalState((prev) => (prev ? { ...prev, historial: [] } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al limpiar historial");
    } finally {
      setClearingHistorial(false);
    }
  };

  const handleInvertirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "jefe") return;
    if (!invertirDestino) {
      setInvertirError("Selecciona dónde invertir.");
      return;
    }
    const { num, valid } = parseMontoInput(invertirMonto);
    if (!valid) {
      setInvertirError("Ingresa un monto válido mayor a 0.");
      return;
    }
    const cajaDisp = capital?.cajaEmpresa ?? 0;
    if (invertirDestino !== "empresa" && num > cajaDisp) {
      setInvertirError("El monto supera la base empresa disponible.");
      return;
    }
    setInvertirError(null);
    setInvertirSaving(true);
    try {
      const token = await user.getIdToken();
      const data = await invertirCajaJefe(token, {
        destino: invertirDestino === "empresa" ? "empresa" : "admin",
        monto: num,
        adminUid: invertirDestino === "empresa" ? undefined : invertirDestino,
      });
      setCapitalState((prev) => (prev ? { ...prev, ...data } : null));
      setInvertirMonto("");
      setToast({
        tipo: invertirDestino === "empresa" ? "aumento" : "reduccion",
        mensaje:
          invertirDestino === "empresa"
            ? "Inversión en base empresa registrada."
            : "Transferencia a la base del administrador registrada.",
      });
      setTimeout(() => setToast(null), TOAST_DURATION);
    } catch (err) {
      setInvertirError(err instanceof Error ? err.message : "Error al invertir");
    } finally {
      setInvertirSaving(false);
    }
  };

  const handleAjustarCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "jefe") return;
    const { delta, valid } = parseAjusteInput(ajusteInput);
    if (!valid || delta === 0) {
      setAjusteError("Ingresa un monto a sumar (ej. 500000) o restar (ej. -300000).");
      return;
    }
    if (delta < 0 && -delta > cajaEmpresa) {
      setAjusteError("No puedes restar más de lo disponible en base empresa.");
      return;
    }
    setAjusteError(null);
    setAjusteSaving(true);
    try {
      const token = await user.getIdToken();
      const data = await ajustarCapital(token, delta);
      setCapitalState((prev) => (prev ? { ...prev, ...data } : null));
      setAjusteInput("");
      setToast({
        tipo: delta > 0 ? "aumento" : "reduccion",
        mensaje: delta > 0 ? "Base aumentada correctamente." : "Base reducida correctamente.",
      });
      setTimeout(() => setToast(null), TOAST_DURATION);
    } catch (e) {
      setAjusteError(e instanceof Error ? e.message : "Error al ajustar base");
    } finally {
      setAjusteSaving(false);
    }
  };

  const monto =
    capital?.capitalEmpresa ??
    capital?.capitalTotal ??
    capital?.monto ??
    0;
  const cajaEmpresa = capital?.cajaEmpresa ?? 0;
  const sumaCapitalAdmins = capital?.sumaCapitalAdmins ?? capital?.capitalAsignadoAdmins ?? 0;
  const historial = capital?.historial ?? [];
  const updatedAt = capital?.updatedAt ?? null;
  const tendencia = getTendencia(historial);
  const chartPointsCapital = getChartPoints(historial, monto);
  const chartPointsCaja = getChartPointsCaja(historial, cajaEmpresa, sumaCapitalAdmins);
  const fechaHoyRaw = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fechaHoy = fechaHoyRaw.charAt(0).toUpperCase() + fechaHoyRaw.slice(1);

  if (!profile || profile.role !== "jefe") return null;

  const desgloseDosLineas = (
    <div className="gf-capital-desglose gf-capital-desglose-dos">
      <span>Capital: {formatMonto(monto)}</span>
      <span>Base: {formatMonto(cajaEmpresa)}</span>
    </div>
  );

  return (
    <div className="gestion-financiera-page">
      <header className="gf-header">
        <div className="gf-header-bg" aria-hidden />
        <div className="gf-header-content gf-header-content--minimal">
          <p className="gf-eyebrow">FINANZAS</p>
          <time className="gf-date" dateTime={new Date().toISOString()}>{fechaHoy}</time>
        </div>
      </header>

      <div className="gf-kpi-grid">
        <div className="gf-kpi-card gf-kpi-capital">
          <span className="gf-kpi-emoji" aria-hidden>💰</span>
          <span className="gf-kpi-value">{formatMonto(monto)}</span>
          <span className="gf-kpi-label">CAPITAL</span>
          <span className="gf-kpi-sub">Total empresa</span>
          {historial.length > 0 && (
            <span className={`gf-kpi-badge ${tendencia === "subiendo" ? "gf-kpi-up" : tendencia === "bajando" ? "gf-kpi-down" : "gf-kpi-neutral"}`}>
              {tendencia === "subiendo" ? "↑" : tendencia === "bajando" ? "↓" : "→"} {tendencia === "estable" ? "Estable" : ""}
            </span>
          )}
        </div>
        <div className="gf-kpi-card gf-kpi-caja">
          <span className="gf-kpi-emoji" aria-hidden>🏦</span>
          <span className="gf-kpi-value">{formatMonto(cajaEmpresa)}</span>
          <span className="gf-kpi-label">BASE DE LA EMPRESA</span>
          <span className="gf-kpi-sub">Liquidez en base</span>
        </div>
      </div>

      <nav className="gf-tabs" role="tablist" aria-label="Secciones de gestión financiera">
        <button
          type="button"
          role="tab"
          aria-selected={seccionActiva === "capital"}
          aria-controls="gf-panel-capital"
          id="gf-tab-capital"
          className={`gf-tab ${seccionActiva === "capital" ? "gf-tab-active" : ""}`}
          onClick={() => setSeccionActiva("capital")}
        >
          <span className="gf-tab-icon" aria-hidden>💰</span>
          Capital
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={seccionActiva === "caja"}
          aria-controls="gf-panel-caja"
          id="gf-tab-caja"
          className={`gf-tab ${seccionActiva === "caja" ? "gf-tab-active" : ""}`}
          onClick={() => setSeccionActiva("caja")}
        >
          <span className="gf-tab-icon" aria-hidden>🏦</span>
          Base
        </button>
      </nav>

      {/* Panel Capital */}
      <div
        id="gf-panel-capital"
        role="tabpanel"
        aria-labelledby="gf-tab-capital"
        hidden={seccionActiva !== "capital"}
        className="gf-panel"
      >
        <div className="gf-capital-card card">
          <div className="gf-capital-card-header">
            <div className="gf-capital-card-title-wrap">
              <span className="gf-capital-icon" aria-hidden>🏢</span>
              <h2 className="gf-capital-card-title">Capital de la empresa</h2>
            </div>
            <span className="gf-capital-badge-privado">🔒 Privado</span>
          </div>
          <p className="gf-capital-card-desc">Solo visible por el jefe. Para ingresar o ajustar montos usa la pestaña Base.</p>

          {loading ? (
            <p className="gf-loading">Cargando…</p>
          ) : (
            <>
              <div className="gf-capital-display">
                <span className="gf-capital-label">CAPITAL TOTAL</span>
                <span className="gf-capital-monto" aria-live="polite">
                  ${formatMonto(monto)}
                </span>
                {desgloseDosLineas}
                <div className="gf-capital-indicators">
                  <span className="gf-capital-indicator">
                    <span className="gf-capital-indicator-icon" aria-hidden>🕐</span>
                    Última actualización: {updatedAt ? formatFechaHora(updatedAt) : "No registrada"}
                  </span>
                  <span className={`gf-capital-tendencia gf-tendencia-${tendencia}`}>
                    <span className="gf-capital-indicator-icon" aria-hidden>📊</span>
                    Tendencia: {tendencia === "subiendo" ? "Subiendo" : tendencia === "bajando" ? "Bajando" : "Estable"}
                  </span>
                </div>
                <div className="gf-mini-chart" role="img" aria-label="Evolución del capital">
                  <MiniChart points={chartPointsCapital} />
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="gf-msg gf-msg-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="gf-historial-card card">
          <div className="gf-historial-header">
            <h2 className="gf-historial-title">
              <span className="gf-historial-icon" aria-hidden>🕐</span>
              HISTORIAL DE CAMBIOS
            </h2>
            <button
              type="button"
              className="gf-historial-clear"
              onClick={handleClearHistorial}
              disabled={clearingHistorial || historial.length === 0}
            >
              Limpiar historial
            </button>
          </div>
          {historial.length === 0 ? (
            <p className="gf-historial-empty">Sin cambios registrados aún.</p>
          ) : (
            <ul className="gf-historial-list">
              {historial.slice(0, MAX_HISTORIAL).map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="gf-historial-item" style={{ animationDelay: `${i * 0.06}s` }}>
                  <span className="gf-historial-emoji" aria-hidden>
                    {entry.montoNuevo >= entry.montoAnterior ? "📈" : "📉"}
                  </span>
                  <div className="gf-historial-body">
                    <span className="gf-historial-text">
                      Capital {entry.montoNuevo >= entry.montoAnterior ? "aumentado" : "reducido"}
                    </span>
                    <span className="gf-historial-detalle">
                      {formatMonto(entry.montoAnterior)} → {formatMonto(entry.montoNuevo)}
                      <span className={entry.montoNuevo >= entry.montoAnterior ? "gf-diff-up" : "gf-diff-down"}>
                        {entry.montoNuevo >= entry.montoAnterior ? "+" : ""}{formatMonto(entry.montoNuevo - entry.montoAnterior)}
                      </span>
                    </span>
                  </div>
                  <span className="gf-historial-hora">{formatSoloHora(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Panel Base (misma estructura que antes el bloque de capital, orientado a base empresa) */}
      <div
        id="gf-panel-caja"
        role="tabpanel"
        aria-labelledby="gf-tab-caja"
        hidden={seccionActiva !== "caja"}
        className="gf-panel"
      >
        <div className="gf-capital-card card">
          <div className="gf-capital-card-header">
            <div className="gf-capital-card-title-wrap">
              <span className="gf-capital-icon" aria-hidden>🏦</span>
              <h2 className="gf-capital-card-title">Base de la empresa</h2>
            </div>
            <span className="gf-capital-badge-privado">🔒 Privado</span>
          </div>
          <p className="gf-capital-card-desc">Solo visible y editable por el jefe. El capital total se calcula como base + Σ capital administradores.</p>

          {loading ? (
            <p className="gf-loading">Cargando…</p>
          ) : (
            <>
              <div className="gf-capital-display">
                <span className="gf-capital-label">BASE TOTAL</span>
                <span className="gf-capital-monto" aria-live="polite">
                  ${formatMonto(cajaEmpresa)}
                </span>
                {desgloseDosLineas}
                <div className="gf-capital-indicators">
                  <span className="gf-capital-indicator">
                    <span className="gf-capital-indicator-icon" aria-hidden>🕐</span>
                    Última actualización: {updatedAt ? formatFechaHora(updatedAt) : "No registrada"}
                  </span>
                  <span className={`gf-capital-tendencia gf-tendencia-${tendencia}`}>
                    <span className="gf-capital-indicator-icon" aria-hidden>📊</span>
                    Tendencia: {tendencia === "subiendo" ? "Subiendo" : tendencia === "bajando" ? "Bajando" : "Estable"}
                  </span>
                </div>
                <p className="gf-caja-chart-note">Evolución aproximada de base (referencia histórica)</p>
                <div className="gf-mini-chart" role="img" aria-label="Evolución de la base">
                  <MiniChart points={chartPointsCaja} />
                </div>
              </div>

              <form
                onSubmit={handleInvertirCaja}
                className="gf-invertir-caja gf-capital-form"
                style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}
              >
                <h3 className="gf-capital-form-label" style={{ marginBottom: "0.35rem", fontSize: "0.95rem" }}>
                  Invertir en base
                </h3>
                <p className="gf-capital-form-hint" style={{ marginBottom: "0.75rem" }}>
                  <strong>Empresa:</strong> suma liquidez a la base empresa.{" "}
                  <strong>Administrador:</strong> transfiere desde la base empresa hacia la base de ese administrador (no cambia el capital total de la empresa).
                </p>
                <label htmlFor="gf-invertir-destino" className="gf-capital-form-label">
                  DESTINO
                </label>
                <div className="gf-capital-input-wrap" style={{ maxWidth: "min(100%, 22rem)" }}>
                  <select
                    id="gf-invertir-destino"
                    value={invertirDestino}
                    onChange={(e) => {
                      setInvertirDestino(e.target.value as "" | "empresa" | string);
                      setInvertirError(null);
                    }}
                    className="gf-capital-input gf-capital-select"
                    disabled={invertirSaving}
                    aria-invalid={!!invertirError}
                  >
                    <option value="">Seleccionar…</option>
                    <option value="empresa">Empresa (base empresa)</option>
                    {adminsOrdenados.map((a, i) => (
                      <option key={a.uid} value={a.uid}>
                        Administrador {i + 1}
                        {a.codigo ? ` (${a.codigo})` : ""}
                        {a.displayName ? ` — ${a.displayName}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <label htmlFor="gf-invertir-monto" className="gf-capital-form-label gf-capital-form-label-second">
                  MONTO
                </label>
                <div className="gf-capital-input-wrap" style={{ maxWidth: "14rem" }}>
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
                  />
                </div>
                {invertirError && (
                  <p className="gf-capital-input-msg-error" role="alert">
                    {invertirError}
                  </p>
                )}
                <button type="submit" className="gf-btn-actualizar" disabled={invertirSaving || !invertirDestino}>
                  {invertirSaving ? "Aplicando…" : "Invertir"}
                </button>
              </form>

              <div className="gf-actualizar-toggle-wrap">
                <button
                  type="button"
                  className={`gf-actualizar-toggle-btn ${formCajaAbierto ? "gf-actualizar-toggle-btn-open" : ""}`}
                  onClick={() => setFormCajaAbierto((v) => !v)}
                  aria-expanded={formCajaAbierto}
                  aria-controls="gf-caja-form-section"
                  title={formCajaAbierto ? "Cerrar sección" : "Actualizar base"}
                  aria-label={formCajaAbierto ? "Cerrar sección de actualización de base" : "Abrir sección para actualizar base de la empresa"}
                >
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {formCajaAbierto && <span className="gf-actualizar-toggle-text">Cerrar</span>}
                </button>
              </div>

              <div
                id="gf-caja-form-section"
                className={`gf-capital-form-section ${formCajaAbierto ? "gf-capital-form-section-open" : ""}`}
                aria-hidden={!formCajaAbierto}
              >
                <form onSubmit={handleSubmitCaja} className="gf-capital-form">
                  <label htmlFor="gf-monto" className="gf-capital-form-label">
                    ACTUALIZAR BASE DE LA EMPRESA
                  </label>
                  <div className="gf-capital-input-wrap">
                    <span className="gf-capital-input-prefix">COP $</span>
                    <input
                      id="gf-monto"
                      type="text"
                      inputMode="decimal"
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        setInputError(null);
                        setInputErrorConfirm(null);
                      }}
                      placeholder="Ej. 5,000,000"
                      className={`gf-capital-input ${inputError ? "gf-capital-input-error" : ""}`}
                      disabled={btnState === "saving"}
                      aria-invalid={!!inputError}
                      aria-describedby={inputError ? "gf-monto-error" : undefined}
                    />
                  </div>
                  {inputError && (
                    <p id="gf-monto-error" className="gf-capital-input-msg-error" role="alert">
                      {inputError}
                    </p>
                  )}
                  <label htmlFor="gf-monto-confirm" className="gf-capital-form-label gf-capital-form-label-second">
                    REPITE EL MONTO PARA CONFIRMAR
                  </label>
                  <div className="gf-capital-input-wrap">
                    <span className="gf-capital-input-prefix">COP $</span>
                    <input
                      id="gf-monto-confirm"
                      type="text"
                      inputMode="decimal"
                      value={inputValueConfirm}
                      onChange={(e) => {
                        setInputValueConfirm(e.target.value);
                        setInputErrorConfirm(null);
                      }}
                      placeholder="Ej. 5,000,000"
                      className={`gf-capital-input ${inputErrorConfirm ? "gf-capital-input-error" : ""}`}
                      disabled={btnState === "saving"}
                      aria-invalid={!!inputErrorConfirm}
                      aria-describedby={inputErrorConfirm ? "gf-monto-confirm-error" : undefined}
                    />
                  </div>
                  {inputErrorConfirm && (
                    <p id="gf-monto-confirm-error" className="gf-capital-input-msg-error" role="alert">
                      {inputErrorConfirm}
                    </p>
                  )}
                  <p className="gf-capital-form-hint">
                    Ingresa el nuevo monto de <strong>base</strong> disponible en la empresa (se reparte el capital total: base + Σ administradores).
                  </p>
                  <button
                    type="submit"
                    className={`gf-btn-actualizar ${btnState === "success" ? "gf-btn-success" : ""}`}
                    disabled={!puedeEnviar}
                  >
                    {btnState === "default" && (
                      <>
                        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                        Actualizar
                      </>
                    )}
                    {btnState === "saving" && (
                      <>
                        <span className="gf-btn-spinner" aria-hidden />
                        Guardando…
                      </>
                    )}
                    {btnState === "success" && "¡Guardado!"}
                  </button>
                </form>

                <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
                  <label htmlFor="gf-ajuste-monto" className="gf-capital-form-label">
                    AJUSTAR BASE (SUMAR O RESTAR)
                  </label>
                  <p className="gf-capital-form-hint" style={{ marginBottom: "0.5rem" }}>
                    Número positivo para sumar a la base; negativo para restar (solo hasta lo disponible).
                  </p>
                  <div className="gf-capital-input-wrap" style={{ maxWidth: "14rem" }}>
                    <span className="gf-capital-input-prefix">COP $</span>
                    <input
                      id="gf-ajuste-monto"
                      type="text"
                      inputMode="decimal"
                      value={ajusteInput}
                      onChange={(e) => { setAjusteInput(e.target.value); setAjusteError(null); }}
                      placeholder="Ej. 500000 o -300000"
                      className={`gf-capital-input ${ajusteError ? "gf-capital-input-error" : ""}`}
                      disabled={ajusteSaving}
                    />
                  </div>
                  {ajusteError && <p className="gf-capital-input-msg-error" role="alert">{ajusteError}</p>}
                  <button
                    type="button"
                    className="gf-btn-actualizar"
                    onClick={handleAjustarCaja}
                    disabled={ajusteSaving || !parseAjusteInput(ajusteInput).valid || parseAjusteInput(ajusteInput).delta === 0}
                  >
                    {ajusteSaving ? "Aplicando…" : "Aplicar ajuste"}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="gf-msg gf-msg-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="gf-historial-card card">
          <div className="gf-historial-header">
            <h2 className="gf-historial-title">
              <span className="gf-historial-icon" aria-hidden>🕐</span>
              HISTORIAL DE CAMBIOS
            </h2>
            <button
              type="button"
              className="gf-historial-clear"
              onClick={handleClearHistorial}
              disabled={clearingHistorial || historial.length === 0}
            >
              Limpiar historial
            </button>
          </div>
          {historial.length === 0 ? (
            <p className="gf-historial-empty">Sin cambios registrados aún.</p>
          ) : (
            <ul className="gf-historial-list">
              {historial.slice(0, MAX_HISTORIAL).map((entry, i) => (
                <li key={`caja-${entry.at}-${i}`} className="gf-historial-item" style={{ animationDelay: `${i * 0.06}s` }}>
                  <span className="gf-historial-emoji" aria-hidden>
                    {entry.montoNuevo >= entry.montoAnterior ? "📈" : "📉"}
                  </span>
                  <div className="gf-historial-body">
                    <span className="gf-historial-text">
                      Capital {entry.montoNuevo >= entry.montoAnterior ? "aumentado" : "reducido"}
                    </span>
                    <span className="gf-historial-detalle">
                      {formatMonto(entry.montoAnterior)} → {formatMonto(entry.montoNuevo)}
                      <span className={entry.montoNuevo >= entry.montoAnterior ? "gf-diff-up" : "gf-diff-down"}>
                        {entry.montoNuevo >= entry.montoAnterior ? "+" : ""}{formatMonto(entry.montoNuevo - entry.montoAnterior)}
                      </span>
                    </span>
                  </div>
                  <span className="gf-historial-hora">{formatSoloHora(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modalAbierto && cajaObjetivoPendiente != null && (
        <div className="gf-modal-backdrop" onClick={handleCerrarModal} aria-hidden>
          <div
            className="gf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gf-modal-title"
            aria-describedby="gf-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="gf-modal-title" className="gf-modal-title">Confirmar base de la empresa</h2>
            <p id="gf-modal-desc" className="gf-modal-desc">
              Vas a establecer la <strong>base</strong> en <strong className="gf-modal-monto">${formatMonto(cajaObjetivoPendiente)}</strong>. El capital total pasará a{" "}
              <strong>${formatMonto(cajaObjetivoPendiente + sumaCapitalAdmins)}</strong> (base + Σ administradores). Ingresa tu contraseña para confirmar.
            </p>
            <label htmlFor="gf-modal-password" className="gf-modal-label">Contraseña</label>
            <input
              id="gf-modal-password"
              type="password"
              value={passwordValue}
              onChange={(e) => {
                setPasswordValue(e.target.value);
                setPasswordError(null);
              }}
              placeholder="Tu contraseña"
              className={`gf-modal-input ${passwordError ? "gf-capital-input-error" : ""}`}
              disabled={isConfirming}
              autoComplete="current-password"
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? "gf-modal-password-error" : undefined}
            />
            {passwordError && (
              <p id="gf-modal-password-error" className="gf-capital-input-msg-error" role="alert">
                {passwordError}
              </p>
            )}
            <div className="gf-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCerrarModal} disabled={isConfirming}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmarModal}
                disabled={isConfirming}
              >
                {isConfirming ? (
                  <>
                    <span className="gf-btn-spinner" aria-hidden />
                    Verificando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`gf-toast gf-toast-${toast.tipo}`}
          role="status"
          aria-live="polite"
          style={{ animation: "gf-toast-in 0.3s ease-out" }}
        >
          <span className={`gf-toast-dot gf-toast-dot-${toast.tipo}`} aria-hidden />
          {toast.mensaje}
        </div>
      )}
    </div>
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
      <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
