"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { listUsersByCreator } from "@/lib/users";
import type { UserProfile } from "@/types/roles";
import { formatMontoEnteroInput } from "@/lib/monto-input-es";
import { HistorialCambiosList } from "./HistorialCambiosList";
import { ModalCuadrarCaja } from "./ModalCuadrarCaja";
import { ModalConfirmarInversion, type InversionPendiente } from "./ModalConfirmarInversion";
import type { CapitalHistorialEntry, CapitalResponse } from "@/lib/capital";

function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function parseMontoInput(value: string): { num: number; valid: boolean } {
  const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(raw);
  if (raw === "" || Number.isNaN(num)) return { num: 0, valid: false };
  if (num <= 0) return { num, valid: false };
  return { num, valid: true };
}

const TOAST_DURATION = 3000;
const BUTTON_SUCCESS_DURATION = 2000;

export function PanelCaja({
  cajaEmpresa,
  sumaCapitalAdmins,
  loading,
  error,
  historial,
  onCapitalUpdate,
  adminsEnabled,
}: {
  cajaEmpresa: number;
  sumaCapitalAdmins: number;
  loading: boolean;
  error: string | null;
  historial: CapitalHistorialEntry[];
  onCapitalUpdate: (data: Partial<CapitalResponse>) => void;
  /** Solo carga administradores cuando la pestaña Caja está activa (evita fetch innecesario). */
  adminsEnabled: boolean;
}) {
  const { profile } = useAuth();

  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  useEffect(() => {
    if (!profile || profile.role !== "jefe" || !adminsEnabled) return;
    let cancelled = false;
    setAdminsLoading(true);
    listUsersByCreator(profile.uid, "admin")
      .then((list) => {
        if (!cancelled) setAdmins(list);
      })
      .catch(() => {
        if (!cancelled) setAdmins([]);
      })
      .finally(() => {
        if (!cancelled) setAdminsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, adminsEnabled]);

  const [tipoLiquidez, setTipoLiquidez] = useState<"entrada" | "inversion_caja_admin">("entrada");
  const [invertirMonto, setInvertirMonto] = useState("");
  const [invertirError, setInvertirError] = useState<string | null>(null);
  const [transferAdminUid, setTransferAdminUid] = useState("");
  const [transferMonto, setTransferMonto] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);

  const [formCajaAbierto, setFormCajaAbierto] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputValueConfirm, setInputValueConfirm] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputErrorConfirm, setInputErrorConfirm] = useState<string | null>(null);
  const [btnState, setBtnState] = useState<"default" | "saving" | "success">("default");

  const [modalCajaAbierto, setModalCajaAbierto] = useState(false);
  const [cajaObjetivoPendiente, setCajaObjetivoPendiente] = useState<number | null>(null);
  const [inversionPendiente, setInversionPendiente] = useState<InversionPendiente | null>(null);

  const [toast, setToast] = useState<{ tipo: "aumento" | "reduccion"; mensaje: string } | null>(null);
  const showToast = (tipo: "aumento" | "reduccion", mensaje: string) => {
    setToast({ tipo, mensaje });
    setTimeout(() => setToast(null), TOAST_DURATION);
  };

  const { num: num1, valid: valid1 } = parseMontoInput(inputValue);
  const { num: num2, valid: valid2 } = parseMontoInput(inputValueConfirm);
  const puedeEnviar = valid1 && valid2 && num1 === num2 && btnState === "default";

  const formsLockedByInversion = inversionPendiente !== null;

  const handleSubmitCaja = (e: FormEvent) => {
    e.preventDefault();
    if (!valid1) {
      setInputError(inputValue.trim() === "" ? "Ingresa un monto válido." : "El monto debe ser mayor a 0.");
      return;
    }
    if (!valid2) {
      setInputErrorConfirm(
        inputValueConfirm.trim() === "" ? "Repite el monto." : "El monto debe ser mayor a 0."
      );
      return;
    }
    if (num1 !== num2) {
      setInputErrorConfirm("Los montos no coinciden.");
      return;
    }
    setInputError(null);
    setInputErrorConfirm(null);
    setCajaObjetivoPendiente(num1);
    setModalCajaAbierto(true);
  };

  const handleInvertirCaja = (e: FormEvent) => {
    e.preventDefault();
    const { num, valid } = parseMontoInput(invertirMonto);
    if (!valid) {
      setInvertirError("Ingresa un monto válido mayor a 0.");
      return;
    }
    setInvertirError(null);
    setInversionPendiente({ tipo: "empresa", monto: num });
  };

  const handleTransferirAdmin = (e: FormEvent) => {
    e.preventDefault();
    if (!transferAdminUid.trim()) {
      setTransferError("Selecciona un administrador.");
      return;
    }
    const { num, valid } = parseMontoInput(transferMonto);
    if (!valid) {
      setTransferError("Ingresa un monto válido mayor a 0.");
      return;
    }
    if (num > cajaEmpresa) {
      setTransferError("El monto supera la caja disponible de la empresa.");
      return;
    }
    const admin = admins.find((a) => a.uid === transferAdminUid.trim());
    const adminNombre = admin?.displayName?.trim() || admin?.email || transferAdminUid.trim();
    setTransferError(null);
    setInversionPendiente({
      tipo: "admin",
      monto: num,
      adminUid: transferAdminUid.trim(),
      adminNombre,
    });
  };

  return (
    <>
      <div className="gf-capital-card card">
        <div className="gf-capital-card-header">
          <div className="gf-capital-card-title-wrap">
            <span className="gf-capital-icon" aria-hidden>
              🏦
            </span>
            <h2 className="gf-capital-card-title">Caja de la empresa</h2>
          </div>
          <span className="gf-capital-badge-privado">🔒 Privado</span>
        </div>
        <p className="gf-capital-card-desc" />

        {loading ? (
          <p className="gf-loading">Cargando…</p>
        ) : (
          <>
            <div className="gf-capital-display">
              <span className="gf-capital-label">CAJA TOTAL</span>
              <span className="gf-capital-monto" aria-live="polite">
                ${formatMonto(cajaEmpresa)}
              </span>
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
                    aria-checked={tipoLiquidez === "entrada"}
                    className={`gf-liquidez-segment gf-liquidez-segment--entrada ${tipoLiquidez === "entrada" ? "gf-liquidez-segment--active" : ""}`}
                    onClick={() => {
                      setTipoLiquidez("entrada");
                      setInvertirError(null);
                      setTransferError(null);
                    }}
                  >
                    <span className="gf-liquidez-segment__icon" aria-hidden>
                      🏦
                    </span>
                    <span className="gf-liquidez-segment__title">Inversión en empresa</span>
                    <span className="gf-liquidez-segment__hint">
                      Aporta efectivo al negocio; sube la caja de la empresa y el capital total.
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={tipoLiquidez === "inversion_caja_admin"}
                    className={`gf-liquidez-segment gf-liquidez-segment--inversion ${tipoLiquidez === "inversion_caja_admin" ? "gf-liquidez-segment--active" : ""}`}
                    onClick={() => {
                      setTipoLiquidez("inversion_caja_admin");
                      setInvertirError(null);
                      setTransferError(null);
                    }}
                  >
                    <span className="gf-liquidez-segment__icon" aria-hidden>
                      📘
                    </span>
                    <span className="gf-liquidez-segment__title">Inversión a caja de administrador</span>
                    <span className="gf-liquidez-segment__hint">
                      Desde la caja de la empresa hacia un admin; el capital total no cambia.
                    </span>
                  </button>
                </div>
              </div>

              {tipoLiquidez === "entrada" ? (
                <form onSubmit={handleInvertirCaja} className="gf-invertir-caja">
                  <p className="gf-capital-form-hint" style={{ marginBottom: "0.75rem" }} />
                  <label htmlFor="gf-invertir-monto" className="gf-capital-form-label">
                    MONTO
                  </label>
                  <div className="gf-capital-input-wrap" style={{ maxWidth: "14rem" }}>
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
                      disabled={formsLockedByInversion}
                    />
                  </div>
                  {invertirError && (
                    <p className="gf-capital-input-msg-error" role="alert">
                      {invertirError}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="gf-btn-actualizar"
                    disabled={formsLockedByInversion}
                    style={{ marginTop: "0.75rem" }}
                  >
                    Registrar inversión en empresa
                  </button>
                </form>
              ) : (
                <form onSubmit={handleTransferirAdmin} className="gf-inversion-caja-admin-form">
                  <p className="gf-capital-form-hint" style={{ marginBottom: "0.75rem" }} />
                  <label htmlFor="gf-transfer-admin" className="gf-capital-form-label">
                    ADMINISTRADOR
                  </label>
                  <select
                    id="gf-transfer-admin"
                    className="gf-capital-input"
                    style={{
                      maxWidth: "100%",
                      width: "100%",
                      marginBottom: "0.75rem",
                      padding: "0.5rem 0.65rem",
                    }}
                    value={transferAdminUid}
                    onChange={(e) => {
                      setTransferAdminUid(e.target.value);
                      setTransferError(null);
                    }}
                    disabled={formsLockedByInversion || adminsLoading}
                  >
                    <option value="">
                      {adminsLoading ? "Cargando…" : admins.length === 0 ? "Sin administradores" : "Selecciona…"}
                    </option>
                    {admins.map((a) => (
                      <option key={a.uid} value={a.uid}>
                        {a.displayName?.trim() || a.email || a.uid}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="gf-transfer-monto" className="gf-capital-form-label">
                    MONTO
                  </label>
                  <div className="gf-capital-input-wrap" style={{ maxWidth: "14rem" }}>
                    <input
                      id="gf-transfer-monto"
                      type="text"
                      inputMode="decimal"
                      value={transferMonto}
                      onChange={(e) => {
                        setTransferMonto(formatMontoEnteroInput(e.target.value));
                        setTransferError(null);
                      }}
                      placeholder="Ej. 200000"
                      className={`gf-capital-input ${transferError ? "gf-capital-input-error" : ""}`}
                      disabled={formsLockedByInversion}
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
                    disabled={formsLockedByInversion || !transferAdminUid || admins.length === 0}
                    style={{ marginTop: "0.75rem" }}
                  >
                    Registrar inversión
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
                aria-label={
                  formCajaAbierto
                    ? "Cerrar sección de cuadrar caja"
                    : "Abrir sección para cuadrar caja (caja de la empresa)"
                }
              >
                <svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
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
                  <input
                    id="gf-monto"
                    type="text"
                    inputMode="decimal"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(formatMontoEnteroInput(e.target.value));
                      setInputError(null);
                      setInputErrorConfirm(null);
                    }}
                    placeholder="Ej. 5,000,000"
                    className={`gf-capital-input ${inputError ? "gf-capital-input-error" : ""}`}
                    disabled={btnState === "saving"}
                  />
                </div>
                {inputError && (
                  <p className="gf-capital-input-msg-error" role="alert">
                    {inputError}
                  </p>
                )}
                <label htmlFor="gf-monto-confirm" className="gf-capital-form-label gf-capital-form-label-second">
                  REPITE EL MONTO DE LA CAJA DE LA EMPRESA
                </label>
                <div className="gf-capital-input-wrap">
                  <input
                    id="gf-monto-confirm"
                    type="text"
                    inputMode="decimal"
                    value={inputValueConfirm}
                    onChange={(e) => {
                      setInputValueConfirm(formatMontoEnteroInput(e.target.value));
                      setInputErrorConfirm(null);
                    }}
                    placeholder="Ej. 5,000,000"
                    className={`gf-capital-input ${inputErrorConfirm ? "gf-capital-input-error" : ""}`}
                    disabled={btnState === "saving"}
                  />
                </div>
                {inputErrorConfirm && (
                  <p className="gf-capital-input-msg-error" role="alert">
                    {inputErrorConfirm}
                  </p>
                )}
                <p className="gf-capital-form-hint">
                  Indica el monto con el que queda <strong>cuadrada la caja de la empresa</strong>. El capital total
                  será caja de la empresa + Σ administradores.
                </p>
                <button
                  type="submit"
                  className={`gf-btn-actualizar ${btnState === "success" ? "gf-btn-success" : ""}`}
                  disabled={!puedeEnviar}
                >
                  {btnState === "default" && (
                    <>
                      <svg
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
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
            <span className="gf-historial-icon" aria-hidden>
              🕐
            </span>
            HISTORIAL DE CAMBIOS
          </h2>
        </div>
        <HistorialCambiosList historial={historial} keyPrefix="caja" />
      </div>

      {modalCajaAbierto && cajaObjetivoPendiente != null && (
        <ModalCuadrarCaja
          cajaObjetivo={cajaObjetivoPendiente}
          sumaCapitalAdmins={sumaCapitalAdmins}
          onClose={() => {
            setModalCajaAbierto(false);
            setCajaObjetivoPendiente(null);
            setBtnState("default");
          }}
          onAfterReauth={() => setBtnState("saving")}
          onSaveError={() => setBtnState("default")}
          onSuccess={(data) => {
            onCapitalUpdate(data);
            const anteriorCaja = cajaEmpresa;
            setInputValue("");
            setInputValueConfirm("");
            setBtnState("success");
            if (data.cajaEmpresa > anteriorCaja) {
              showToast("aumento", "Caja de la empresa actualizada correctamente.");
            } else {
              showToast("reduccion", "Caja de la empresa actualizada.");
            }
            setTimeout(() => setBtnState("default"), BUTTON_SUCCESS_DURATION);
            setModalCajaAbierto(false);
            setCajaObjetivoPendiente(null);
          }}
        />
      )}

      {inversionPendiente != null && (
        <ModalConfirmarInversion
          inversion={inversionPendiente}
          onClose={() => setInversionPendiente(null)}
          onSuccess={(data) => {
            onCapitalUpdate(data);
            const tipo = inversionPendiente.tipo;
            if (tipo === "empresa") {
              setInvertirMonto("");
              showToast("aumento", "Inversión en empresa registrada.");
            } else {
              setTransferMonto("");
              showToast("aumento", "Inversión a caja de administrador registrada.");
            }
            setInversionPendiente(null);
          }}
        />
      )}

      {toast && (
        <div
          className={`gf-toast gf-toast-${toast.tipo}`}
          role="status"
          aria-live="polite"
        >
          <span className={`gf-toast-dot gf-toast-dot-${toast.tipo}`} aria-hidden />
          {toast.mensaje}
        </div>
      )}
    </>
  );
}
