"use client";

import { useState, useEffect, useCallback } from "react";
import { reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import {
  getCapital,
  setCapital,
  invertirCajaJefe,
  transferirBaseEmpresaAAdmin,
  type CapitalHistorialEntry,
  type CapitalResponse,
} from "@/lib/capital";
import { listUsersByCreator } from "@/lib/users";
import type { UserProfile } from "@/types/roles";
/** Cuántas filas mostrar en cada panel de historial (el API puede devolver hasta 100). */
const FLUJO_UI_LIMIT = 50;

function etiquetaTipoFlujo(tipo: string | undefined): string {
  switch (tipo) {
    case "cuadrar_caja":
    case "definicion_capital":
      return "Cuadrar caja";
    case "ajuste_caja":
      return "Ajuste de base";
    case "inversion_admin":
      return "Transferencia a administrador (histórico)";
    case "gasto_empresa":
      return "Gasto de empresa";
    case "asignacion_nuevo_admin":
      return "Asignación a nuevo administrador";
    case "inversion_caja_admin":
    case "traspaso_base_admin":
      return "Inversión a caja de administrador";
    default:
      return "Cambio de capital";
  }
}
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

function montoInversionHistorial(entry: CapitalHistorialEntry): number | null {
  if (typeof entry.montoTransferencia === "number" && entry.montoTransferencia > 0) {
    return entry.montoTransferencia;
  }
  if (
    typeof entry.cajaAnterior === "number" &&
    typeof entry.cajaNueva === "number" &&
    entry.cajaAnterior > entry.cajaNueva
  ) {
    return Math.round((entry.cajaAnterior - entry.cajaNueva) * 100) / 100;
  }
  return null;
}

/** Inversión a caja de admin o movimientos equivalentes con monto explícito y sin variación de capital total. */
function esHistorialInversionAzul(entry: CapitalHistorialEntry): boolean {
  const m = montoInversionHistorial(entry);
  if (m == null) return false;
  const t = entry.tipo;
  if (t === "inversion_caja_admin" || t === "traspaso_base_admin") return true;
  if (t === "asignacion_nuevo_admin" || t === "inversion_admin") {
    return entry.montoNuevo === entry.montoAnterior;
  }
  return false;
}

function HistorialCambiosList({
  historial,
  keyPrefix,
}: {
  historial: CapitalHistorialEntry[];
  keyPrefix: string;
}) {
  if (historial.length === 0) {
    return <p className="gf-historial-empty">Sin cambios registrados aún.</p>;
  }
  return (
    <ul className="gf-historial-list">
      {historial.slice(0, FLUJO_UI_LIMIT).map((entry, i) => {
        const diff = entry.montoNuevo - entry.montoAnterior;
        const azul = esHistorialInversionAzul(entry);
        const mInv = montoInversionHistorial(entry);
        return (
          <li
            key={entry.id ? `${keyPrefix}-${entry.id}` : `${keyPrefix}-${entry.at}-${i}`}
            className="gf-historial-item"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <span className="gf-historial-emoji" aria-hidden>
              {azul ? "📘" : entry.montoNuevo >= entry.montoAnterior ? "📈" : "📉"}
            </span>
            <div className="gf-historial-body">
              <span className="gf-historial-text">
                {etiquetaTipoFlujo(entry.tipo)}
              </span>
              <span className="gf-historial-detalle">
                {azul && mInv != null ? (
                  <>
                    <span className="gf-historial-capital-neutro">
                      {diff === 0
                        ? `Capital total sin cambio neto (${formatMonto(entry.montoAnterior)})`
                        : `Capital ${formatMonto(entry.montoAnterior)} → ${formatMonto(entry.montoNuevo)}`}
                    </span>
                    <span className="gf-historial-inversion-wrap">
                      <span className="gf-historial-inversion-label"> · Inversión </span>
                      <span className="gf-diff-inversion">{formatMonto(mInv)}</span>
                      {entry.adminNombre ? (
                        <span className="gf-historial-admin-sufijo"> · {entry.adminNombre}</span>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    {formatMonto(entry.montoAnterior)} → {formatMonto(entry.montoNuevo)}
                    <span
                      className={
                        entry.montoNuevo >= entry.montoAnterior ? "gf-diff-up" : "gf-diff-down"
                      }
                    >
                      {entry.montoNuevo >= entry.montoAnterior ? "+" : ""}
                      {formatMonto(entry.montoNuevo - entry.montoAnterior)}
                    </span>
                  </>
                )}
              </span>
            </div>
            <span className="gf-historial-hora">{formatSoloHora(entry.at)}</span>
          </li>
        );
      })}
    </ul>
  );
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
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cajaObjetivoPendiente, setCajaObjetivoPendiente] = useState<number | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordConfirmValue, setPasswordConfirmValue] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [formCajaAbierto, setFormCajaAbierto] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState<"capital" | "caja">("capital");
  const [tipoLiquidezBase, setTipoLiquidezBase] = useState<"entrada" | "inversion_caja_admin">("entrada");
  const [invertirMonto, setInvertirMonto] = useState("");
  const [invertirSaving, setInvertirSaving] = useState(false);
  const [invertirError, setInvertirError] = useState<string | null>(null);
  const [adminsEmpresa, setAdminsEmpresa] = useState<UserProfile[]>([]);
  const [adminsEmpresaLoading, setAdminsEmpresaLoading] = useState(false);
  const [transferAdminUid, setTransferAdminUid] = useState("");
  const [transferMonto, setTransferMonto] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

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
    if (!profile || profile.role !== "jefe" || seccionActiva !== "caja") return;
    let cancelled = false;
    setAdminsEmpresaLoading(true);
    listUsersByCreator(profile.uid, "admin")
      .then((list) => {
        if (!cancelled) setAdminsEmpresa(list);
      })
      .catch(() => {
        if (!cancelled) setAdminsEmpresa([]);
      })
      .finally(() => {
        if (!cancelled) setAdminsEmpresaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, seccionActiva]);

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
    setPasswordConfirmValue("");
    setPasswordError(null);
    setModalAbierto(true);
  };

  const handleCerrarModal = () => {
    setModalAbierto(false);
    setCajaObjetivoPendiente(null);
    setPasswordValue("");
    setPasswordConfirmValue("");
    setPasswordError(null);
  };

  const handleConfirmarModal = async () => {
    if (!user || !profile || profile.role !== "jefe" || cajaObjetivoPendiente == null || !auth) return;
    if (!passwordValue.trim()) {
      setPasswordError("Ingresa tu contraseña para confirmar.");
      return;
    }
    if (!passwordConfirmValue.trim()) {
      setPasswordError("Repite la contraseña en el segundo campo.");
      return;
    }
    if (passwordValue !== passwordConfirmValue) {
      setPasswordError("Las contraseñas no coinciden.");
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
        setToast({ tipo: "aumento", mensaje: "Caja de la empresa actualizada correctamente." });
      } else {
        setToast({ tipo: "reduccion", mensaje: "Caja de la empresa actualizada." });
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

  const handleInvertirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "jefe") return;
    const { num, valid } = parseMontoInput(invertirMonto);
    if (!valid) {
      setInvertirError("Ingresa un monto válido mayor a 0.");
      return;
    }
    setInvertirError(null);
    setInvertirSaving(true);
    try {
      const token = await user.getIdToken();
      const data = await invertirCajaJefe(token, { monto: num });
      setCapitalState((prev) => (prev ? { ...prev, ...data } : null));
      setInvertirMonto("");
      setToast({
        tipo: "aumento",
        mensaje: "Inversión en empresa registrada.",
      });
      setTimeout(() => setToast(null), TOAST_DURATION);
    } catch (err) {
      setInvertirError(err instanceof Error ? err.message : "Error al invertir");
    } finally {
      setInvertirSaving(false);
    }
  };

  const handleTransferirBaseAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || profile.role !== "jefe") return;
    if (!transferAdminUid.trim()) {
      setTransferError("Selecciona un administrador.");
      return;
    }
    const { num, valid } = parseMontoInput(transferMonto);
    if (!valid) {
      setTransferError("Ingresa un monto válido mayor a 0.");
      return;
    }
    const cajaDisponible = capital?.cajaEmpresa ?? 0;
    if (num > cajaDisponible) {
      setTransferError("El monto supera la caja disponible de la empresa.");
      return;
    }
    setTransferError(null);
    setTransferSaving(true);
    try {
      const token = await user.getIdToken();
      const data = await transferirBaseEmpresaAAdmin(token, {
        adminUid: transferAdminUid.trim(),
        monto: num,
      });
      setCapitalState((prev) => (prev ? { ...prev, ...data } : null));
      setTransferMonto("");
      setToast({
        tipo: "aumento",
        mensaje: "Inversión a caja de administrador registrada.",
      });
      setTimeout(() => setToast(null), TOAST_DURATION);
    } catch (err) {
      setTransferError(
        err instanceof Error ? err.message : "Error al registrar la inversión"
      );
    } finally {
      setTransferSaving(false);
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
      <span>Caja: {formatMonto(cajaEmpresa)}</span>
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
          <span className="gf-kpi-label">CAJA DE LA EMPRESA</span>
          <span className="gf-kpi-sub">Liquidez en caja</span>
        </div>
      </div>

      <nav className="gf-tabs" role="tablist" aria-label="Secciones de gestión financiera: capital y caja de la empresa">
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
          Caja
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
          <p className="gf-capital-card-desc">Solo visible por el jefe. Para ingresar o ajustar montos usa la pestaña Caja.</p>

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
          </div>
          <HistorialCambiosList historial={historial} keyPrefix="cap" />
        </div>
      </div>

      {/* Panel caja empresa (liquidez del jefe) */}
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
              <h2 className="gf-capital-card-title">Caja de la empresa</h2>
            </div>
            <span className="gf-capital-badge-privado">🔒 Privado</span>
          </div>
          <p className="gf-capital-card-desc">Solo visible y editable por el jefe. El capital total se calcula como caja de la empresa + Σ capital administradores.</p>

          {loading ? (
            <p className="gf-loading">Cargando…</p>
          ) : (
            <>
              <div className="gf-capital-display">
                <span className="gf-capital-label">CAJA TOTAL</span>
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
                <p className="gf-caja-chart-note">Evolución aproximada de la caja (referencia histórica)</p>
                <div className="gf-mini-chart" role="img" aria-label="Evolución de la caja de la empresa">
                  <MiniChart points={chartPointsCaja} />
                </div>
              </div>

              <div
                className="gf-capital-form"
                style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}
              >
                <h3 className="gf-liquidez-section-title">Liquidez y administradores</h3>
                <div className="gf-liquidez-switch" role="radiogroup" aria-label="Tipo de movimiento de liquidez">
                  <p id="gf-liquidez-switch-desc" className="gf-liquidez-switch-label">
                    Elige una opción
                  </p>
                  <div className="gf-liquidez-segmented" aria-describedby="gf-liquidez-switch-desc">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={tipoLiquidezBase === "entrada"}
                      className={`gf-liquidez-segment gf-liquidez-segment--entrada ${tipoLiquidezBase === "entrada" ? "gf-liquidez-segment--active" : ""}`}
                      onClick={() => {
                        setTipoLiquidezBase("entrada");
                        setInvertirError(null);
                        setTransferError(null);
                      }}
                    >
                      <span className="gf-liquidez-segment__icon" aria-hidden>🏦</span>
                      <span className="gf-liquidez-segment__title">Inversión en empresa</span>
                      <span className="gf-liquidez-segment__hint">Aporta efectivo al negocio; sube la caja de la empresa y el capital total.</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={tipoLiquidezBase === "inversion_caja_admin"}
                      className={`gf-liquidez-segment gf-liquidez-segment--inversion ${tipoLiquidezBase === "inversion_caja_admin" ? "gf-liquidez-segment--active" : ""}`}
                      onClick={() => {
                        setTipoLiquidezBase("inversion_caja_admin");
                        setInvertirError(null);
                        setTransferError(null);
                      }}
                    >
                      <span className="gf-liquidez-segment__icon" aria-hidden>📘</span>
                      <span className="gf-liquidez-segment__title">Inversión a caja de administrador</span>
                      <span className="gf-liquidez-segment__hint">Desde la caja de la empresa hacia un admin; el capital total no cambia.</span>
                    </button>
                  </div>
                </div>

                {tipoLiquidezBase === "entrada" ? (
                  <form onSubmit={handleInvertirCaja} className="gf-invertir-caja">
                    <p className="gf-capital-form-hint" style={{ marginBottom: "0.75rem" }}>
                      Registra una inversión en la empresa: entra dinero nuevo, sube la caja de la empresa y el capital total.
                    </p>
                    <label htmlFor="gf-invertir-monto" className="gf-capital-form-label">
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
                    <button type="submit" className="gf-btn-actualizar" disabled={invertirSaving} style={{ marginTop: "0.75rem" }}>
                      {invertirSaving ? "Aplicando…" : "Registrar inversión en empresa"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleTransferirBaseAdmin} className="gf-inversion-caja-admin-form">
                    <p className="gf-capital-form-hint" style={{ marginBottom: "0.75rem" }}>
                      Invierte desde la caja de la empresa hacia la caja de un administrador. El capital total no cambia: baja el saldo en caja del jefe y sube la caja del administrador.
                    </p>
                    <label htmlFor="gf-transfer-admin" className="gf-capital-form-label">
                      ADMINISTRADOR
                    </label>
                    <select
                      id="gf-transfer-admin"
                      className="gf-capital-input"
                      style={{ maxWidth: "100%", width: "100%", marginBottom: "0.75rem", padding: "0.5rem 0.65rem" }}
                      value={transferAdminUid}
                      onChange={(e) => {
                        setTransferAdminUid(e.target.value);
                        setTransferError(null);
                      }}
                      disabled={transferSaving || adminsEmpresaLoading}
                    >
                      <option value="">
                        {adminsEmpresaLoading ? "Cargando…" : adminsEmpresa.length === 0 ? "Sin administradores" : "Selecciona…"}
                      </option>
                      {adminsEmpresa.map((a) => (
                        <option key={a.uid} value={a.uid}>
                          {a.displayName?.trim() || a.email || a.uid}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="gf-transfer-monto" className="gf-capital-form-label">
                      MONTO
                    </label>
                    <div className="gf-capital-input-wrap" style={{ maxWidth: "14rem" }}>
                      <span className="gf-capital-input-prefix">COP $</span>
                      <input
                        id="gf-transfer-monto"
                        type="text"
                        inputMode="decimal"
                        value={transferMonto}
                        onChange={(e) => {
                          setTransferMonto(e.target.value);
                          setTransferError(null);
                        }}
                        placeholder="Ej. 200000"
                        className={`gf-capital-input ${transferError ? "gf-capital-input-error" : ""}`}
                        disabled={transferSaving}
                      />
                    </div>
                    {transferError && (
                      <p className="gf-capital-input-msg-error" role="alert">
                        {transferError}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="gf-btn-actualizar"
                      disabled={transferSaving || !transferAdminUid || adminsEmpresa.length === 0}
                      style={{ marginTop: "0.75rem" }}
                    >
                      {transferSaving ? "Aplicando…" : "Registrar inversión"}
                    </button>
                  </form>
                )}
              </div>

              <div className="gf-actualizar-toggle-wrap">
                <button
                  type="button"
                  className={`gf-actualizar-toggle-btn ${formCajaAbierto ? "gf-actualizar-toggle-btn-open" : ""}`}
                  onClick={() => setFormCajaAbierto((v) => !v)}
                  aria-expanded={formCajaAbierto}
                  aria-controls="gf-caja-form-section"
                  title={formCajaAbierto ? "Cerrar sección" : "Cuadrar caja"}
                  aria-label={formCajaAbierto ? "Cerrar sección de cuadrar caja" : "Abrir sección para cuadrar caja (caja de la empresa)"}
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
                    CUADRAR CAJA — CAJA DE LA EMPRESA
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
                    REPITE EL MONTO DE LA CAJA DE LA EMPRESA
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
                    Indica el monto con el que queda <strong>cuadrada la caja de la empresa</strong>. El capital total será caja de la empresa + Σ administradores.
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
          </div>
          <HistorialCambiosList historial={historial} keyPrefix="caja" />
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
            <h2 id="gf-modal-title" className="gf-modal-title">Cuadrar caja</h2>
            <p id="gf-modal-desc" className="gf-modal-desc">
              Vas a <strong>cuadrar la caja de la empresa</strong> con saldo <strong className="gf-modal-monto">${formatMonto(cajaObjetivoPendiente)}</strong>. El capital total pasará a{" "}
              <strong>${formatMonto(cajaObjetivoPendiente + sumaCapitalAdmins)}</strong> (caja de la empresa + Σ administradores). La caja de la empresa quedará exactamente en ese monto. Escribe tu contraseña dos veces para confirmar.
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
            <label htmlFor="gf-modal-password-confirm" className="gf-modal-label" style={{ marginTop: "0.75rem" }}>
              Repite la contraseña
            </label>
            <input
              id="gf-modal-password-confirm"
              type="password"
              value={passwordConfirmValue}
              onChange={(e) => {
                setPasswordConfirmValue(e.target.value);
                setPasswordError(null);
              }}
              placeholder="Repite la misma contraseña"
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
