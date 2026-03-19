"use client";

import { useState, useEffect, useCallback } from "react";
import { reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { getCapital, setCapital, ajustarCapital, registrarSalidaCapital, clearCapitalHistorial, type CapitalHistorialEntry, type CapitalResponse } from "@/lib/capital";

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

/** Puntos para el mini chart: [monto0, monto1, ...] desde el más antiguo al más reciente */
function getChartPoints(historial: CapitalHistorialEntry[], montoActual: number): number[] {
  if (historial.length === 0) return montoActual > 0 ? [montoActual] : [0];
  const points = [...historial].reverse().map((h) => h.montoNuevo);
  points.push(montoActual);
  return points;
}

/** Parsea valor de input a número (acepta puntos/comas como miles/decimal). */
function parseMontoInput(value: string): { num: number; valid: boolean } {
  const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(raw);
  if (raw === "" || Number.isNaN(num)) return { num: 0, valid: false };
  if (num <= 0) return { num, valid: false };
  return { num, valid: true };
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
  const [montoPendiente, setMontoPendiente] = useState<number | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [formActualizarAbierto, setFormActualizarAbierto] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState<"capital" | "salidas" | "ingresos">("capital");
  const [salidaMonto, setSalidaMonto] = useState("");
  const [salidaSaving, setSalidaSaving] = useState(false);
  const [salidaError, setSalidaError] = useState<string | null>(null);
  const [ajusteInput, setAjusteInput] = useState("");
  const [ajusteSaving, setAjusteSaving] = useState(false);
  const [ajusteError, setAjusteError] = useState<string | null>(null);

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

  const handleSubmit = (e: React.FormEvent) => {
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
    setMontoPendiente(num1);
    setPasswordValue("");
    setPasswordError(null);
    setModalAbierto(true);
  };

  const handleCerrarModal = () => {
    setModalAbierto(false);
    setMontoPendiente(null);
    setPasswordValue("");
    setPasswordError(null);
  };

  const handleConfirmarModal = async () => {
    if (!user || !profile || profile.role !== "jefe" || montoPendiente == null || !auth) return;
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
      const data = await setCapital(token, montoPendiente);
      setCapitalState((prev) => ({
        ...prev,
        monto: data.monto,
        capitalTotal: data.capitalTotal,
        cajaEmpresa: data.cajaEmpresa,
        capitalAsignadoAdmins: data.capitalAsignadoAdmins,
        updatedAt: data.updatedAt,
        historial: data.historial,
      }));
      setInputValue("");
      setInputValueConfirm("");
      setBtnState("success");
      const anterior = capital?.monto ?? 0;
      if (data.monto > anterior) {
        setToast({ tipo: "aumento", mensaje: "Capital aumentado correctamente." });
      } else {
        setToast({ tipo: "reduccion", mensaje: "Capital actualizado." });
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

  const handleRegistrarSalida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "jefe") return;
    const num = parseMontoInput(salidaMonto);
    if (!num.valid || num.num <= 0) {
      setSalidaError("Ingresa un monto válido mayor a 0.");
      return;
    }
    if (num.num > cajaEmpresa) {
      setSalidaError("El monto no puede superar la caja empresa disponible.");
      return;
    }
    setSalidaError(null);
    setSalidaSaving(true);
    try {
      const token = await user.getIdToken();
      const data = await registrarSalidaCapital(token, num.num);
      setCapitalState((prev) => (prev ? { ...prev, ...data } : null));
      setSalidaMonto("");
      setToast({ tipo: "reduccion", mensaje: "Salida registrada correctamente." });
      setTimeout(() => setToast(null), TOAST_DURATION);
    } catch (e) {
      setSalidaError(e instanceof Error ? e.message : "Error al registrar salida");
    } finally {
      setSalidaSaving(false);
    }
  };

  /** Parsea ajuste: acepta positivo (sumar) o negativo (restar). Ej: "500000" o "-300000" */
  const parseAjusteInput = (value: string): { delta: number; valid: boolean } => {
    const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    if (raw === "" || raw === "-") return { delta: 0, valid: false };
    const num = Number(raw);
    if (Number.isNaN(num)) return { delta: 0, valid: false };
    return { delta: num, valid: true };
  };

  const handleAjustarCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "jefe") return;
    const { delta, valid } = parseAjusteInput(ajusteInput);
    if (!valid || delta === 0) {
      setAjusteError("Ingresa un monto a sumar (ej. 500000) o restar (ej. -300000).");
      return;
    }
    if (delta < 0 && -delta > cajaEmpresa) {
      setAjusteError("No puedes restar más de lo disponible en caja empresa (sin tocar lo asignado a admins).");
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
        mensaje: delta > 0 ? "Capital aumentado correctamente." : "Capital reducido correctamente.",
      });
      setTimeout(() => setToast(null), TOAST_DURATION);
    } catch (e) {
      setAjusteError(e instanceof Error ? e.message : "Error al ajustar capital");
    } finally {
      setAjusteSaving(false);
    }
  };

  const monto = capital?.capitalTotal ?? capital?.monto ?? 0;
  const cajaEmpresa = capital?.cajaEmpresa ?? 0;
  const capitalAsignadoAdmins = capital?.capitalAsignadoAdmins ?? 0;
  const historial = capital?.historial ?? [];
  const updatedAt = capital?.updatedAt ?? null;
  const tendencia = getTendencia(historial);
  const chartPoints = getChartPoints(historial, monto);
  const fechaHoyRaw = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fechaHoy = fechaHoyRaw.charAt(0).toUpperCase() + fechaHoyRaw.slice(1);

  if (!profile || profile.role !== "jefe") return null;

  return (
    <div className="gestion-financiera-page">
      {/* Page header */}
      <header className="gf-header">
        <div className="gf-header-bg" aria-hidden />
        <div className="gf-header-content">
          <div className="gf-header-left">
            <p className="gf-eyebrow">FINANZAS</p>
            <h1 className="gf-title">
              <span className="gf-title-gradient">Gestión</span> financiera
            </h1>
            <p className="gf-desc">
              Administra el capital, visualiza ingresos y controla el flujo financiero de tu empresa. Solo visible para el jefe.
            </p>
          </div>
          <div className="gf-header-right">
            <span className="gf-badge-acceso">
              <span className="gf-badge-dot" aria-hidden />
              Acceso restringido
            </span>
            <time className="gf-date" dateTime={new Date().toISOString()}>{fechaHoy}</time>
          </div>
        </div>
      </header>

      {/* KPI cards */}
      <div className="gf-kpi-grid">
        <div className="gf-kpi-card gf-kpi-capital">
          <span className="gf-kpi-emoji" aria-hidden>💰</span>
          <span className="gf-kpi-value">{formatMonto(monto)}</span>
          <span className="gf-kpi-label">CAPITAL ACTUAL</span>
          <span className="gf-kpi-sub">Fondos disponibles</span>
          {historial.length > 0 && (
            <span className={`gf-kpi-badge ${tendencia === "subiendo" ? "gf-kpi-up" : tendencia === "bajando" ? "gf-kpi-down" : "gf-kpi-neutral"}`}>
              {tendencia === "subiendo" ? "↑" : tendencia === "bajando" ? "↓" : "→"} {tendencia === "estable" ? "Estable" : ""}
            </span>
          )}
        </div>
        <div className="gf-kpi-card gf-kpi-ingresos">
          <span className="gf-kpi-emoji" aria-hidden>📈</span>
          <span className="gf-kpi-value">$0</span>
          <span className="gf-kpi-label">INGRESOS DEL MES</span>
          <span className="gf-kpi-sub">vs mes anterior</span>
        </div>
        <div className="gf-kpi-card gf-kpi-gastos">
          <span className="gf-kpi-emoji" aria-hidden>🏢</span>
          <span className="gf-kpi-value">$0</span>
          <span className="gf-kpi-label">GASTOS OPERATIVOS</span>
          <span className="gf-kpi-sub">Este mes</span>
        </div>
      </div>

      {/* Tabs: Capital | Salidas */}
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
          aria-selected={seccionActiva === "salidas"}
          aria-controls="gf-panel-salidas"
          id="gf-tab-salidas"
          className={`gf-tab ${seccionActiva === "salidas" ? "gf-tab-active" : ""}`}
          onClick={() => setSeccionActiva("salidas")}
        >
          <span className="gf-tab-icon" aria-hidden>📤</span>
          Salidas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={seccionActiva === "ingresos"}
          aria-controls="gf-panel-ingresos"
          id="gf-tab-ingresos"
          className={`gf-tab ${seccionActiva === "ingresos" ? "gf-tab-active" : ""}`}
          onClick={() => setSeccionActiva("ingresos")}
        >
          <span className="gf-tab-icon" aria-hidden>📥</span>
          Ingresos
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
      {/* Capital display + form */}
      <div className="gf-capital-card card">
        <div className="gf-capital-card-header">
          <div className="gf-capital-card-title-wrap">
            <span className="gf-capital-icon" aria-hidden>🏢</span>
            <h2 className="gf-capital-card-title">Capital de empresa</h2>
          </div>
          <span className="gf-capital-badge-privado">🔒 Privado</span>
        </div>
        <p className="gf-capital-card-desc">Solo visible y editable por el jefe</p>

        {loading ? (
          <p className="gf-loading">Cargando capital...</p>
        ) : (
          <>
            <div className="gf-capital-display">
              <span className="gf-capital-label">CAPITAL TOTAL</span>
              <span className="gf-capital-monto" aria-live="polite">
                ${formatMonto(monto)}
              </span>
              <div className="gf-capital-desglose" style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                <span>Caja empresa: {formatMonto(cajaEmpresa)}</span>
                <span style={{ marginLeft: "1rem" }}>Asignado a admins: {formatMonto(capitalAsignadoAdmins)}</span>
              </div>
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
                <MiniChart points={chartPoints} />
              </div>
            </div>

            <div className="gf-actualizar-toggle-wrap">
              <button
                type="button"
                className={`gf-actualizar-toggle-btn ${formActualizarAbierto ? "gf-actualizar-toggle-btn-open" : ""}`}
                onClick={() => setFormActualizarAbierto((v) => !v)}
                aria-expanded={formActualizarAbierto}
                aria-controls="gf-capital-form-section"
                title={formActualizarAbierto ? "Cerrar sección de actualización" : "Actualizar capital"}
                aria-label={formActualizarAbierto ? "Cerrar sección de actualización" : "Abrir sección para actualizar capital"}
              >
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                {formActualizarAbierto && <span className="gf-actualizar-toggle-text">Cerrar</span>}
              </button>
            </div>

            <div
              id="gf-capital-form-section"
              className={`gf-capital-form-section ${formActualizarAbierto ? "gf-capital-form-section-open" : ""}`}
              aria-hidden={!formActualizarAbierto}
            >
            <form onSubmit={handleSubmit} className="gf-capital-form">
              <label htmlFor="gf-monto" className="gf-capital-form-label">
                ACTUALIZAR CAPITAL
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
              <p className="gf-capital-form-hint">Ingresa el nuevo monto total de capital disponible y repítelo para confirmar.</p>
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
                AJUSTAR CAPITAL (SUMAR O RESTAR)
              </label>
              <p className="gf-capital-form-hint" style={{ marginBottom: "0.5rem" }}>
                Número positivo para sumar a capital y caja; negativo para restar (solo hasta lo disponible en caja empresa).
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
                onClick={handleAjustarCapital}
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

      {/* Historial */}
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

      {/* Panel Salidas */}
      <div
        id="gf-panel-salidas"
        role="tabpanel"
        aria-labelledby="gf-tab-salidas"
        hidden={seccionActiva !== "salidas"}
        className="gf-panel"
      >
        <div className="gf-salidas-card card">
          <div className="gf-salidas-header">
            <span className="gf-salidas-icon" aria-hidden>📤</span>
            <h2 className="gf-salidas-title">Salidas</h2>
          </div>
          <p className="gf-salidas-desc">Registro de retiros de caja empresa. Reduce el capital total y la caja disponible.</p>
          <p style={{ marginBottom: "1rem", fontWeight: 600 }}>Caja empresa disponible: {formatMonto(cajaEmpresa)}</p>
          <form onSubmit={handleRegistrarSalida} className="gf-capital-form" style={{ maxWidth: "20rem" }}>
            <label htmlFor="gf-salida-monto" className="gf-capital-form-label">MONTO A RETIRAR</label>
            <div className="gf-capital-input-wrap">
              <span className="gf-capital-input-prefix">COP $</span>
              <input
                id="gf-salida-monto"
                type="text"
                inputMode="decimal"
                value={salidaMonto}
                onChange={(e) => { setSalidaMonto(e.target.value); setSalidaError(null); }}
                placeholder="Ej. 500000"
                className={`gf-capital-input ${salidaError ? "gf-capital-input-error" : ""}`}
                disabled={salidaSaving}
              />
            </div>
            {salidaError && <p className="gf-capital-input-msg-error" role="alert">{salidaError}</p>}
            <button type="submit" className="gf-btn-actualizar" disabled={salidaSaving}>
              {salidaSaving ? "Registrando…" : "Registrar salida"}
            </button>
          </form>
        </div>
      </div>

      {/* Panel Ingresos */}
      <div
        id="gf-panel-ingresos"
        role="tabpanel"
        aria-labelledby="gf-tab-ingresos"
        hidden={seccionActiva !== "ingresos"}
        className="gf-panel"
      >
        <div className="gf-ingresos-card card">
          <div className="gf-ingresos-header">
            <span className="gf-ingresos-icon" aria-hidden>📥</span>
            <h2 className="gf-ingresos-title">Ingresos</h2>
          </div>
          <p className="gf-ingresos-desc">Registro y control de ingresos de dinero (ventas, cobros, entradas al capital).</p>
          <p className="gf-ingresos-empty">Contenido en desarrollo. Próximamente podrás gestionar los ingresos desde aquí.</p>
        </div>
      </div>

      {/* Modal confirmación + contraseña */}
      {modalAbierto && montoPendiente != null && (
        <div className="gf-modal-backdrop" onClick={handleCerrarModal} aria-hidden>
          <div
            className="gf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gf-modal-title"
            aria-describedby="gf-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="gf-modal-title" className="gf-modal-title">Confirmar actualización de capital</h2>
            <p id="gf-modal-desc" className="gf-modal-desc">
              Vas a actualizar el capital a <strong className="gf-modal-monto">${formatMonto(montoPendiente)}</strong>. Ingresa tu contraseña para confirmar.
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

      {/* Toast */}
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
