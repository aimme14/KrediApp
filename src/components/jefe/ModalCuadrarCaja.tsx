"use client";

import { useState, useEffect } from "react";
import { reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { setCapital } from "@/lib/capital";
import type { CapitalResponse } from "@/lib/capital";

function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ModalCuadrarCaja({
  cajaObjetivo,
  sumaCapitalAdmins,
  onClose,
  onAfterReauth,
  onSuccess,
  onSaveError,
}: {
  cajaObjetivo: number;
  sumaCapitalAdmins: number;
  onClose: () => void;
  /** Tras reautenticación OK y antes de PUT capital (p. ej. cerrar modal y poner el botón principal en “Guardando…”). */
  onAfterReauth?: () => void;
  onSuccess: (data: CapitalResponse & { ok: boolean }) => void;
  /** Error en setCapital tras haber cerrado el modal (p. ej. restaurar estado del botón). */
  onSaveError?: (message: string) => void;
}) {
  const { user, profile } = useAuth();
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordConfirmValue, setPasswordConfirmValue] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isConfirming) return;
      onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [isConfirming, onClose]);

  const handleConfirmar = async () => {
    if (!user || !profile || !auth) return;
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
    let passedReauth = false;
    try {
      const email = profile.email || user.email;
      if (!email) {
        setPasswordError("No se pudo verificar tu cuenta.");
        return;
      }
      const credential = EmailAuthProvider.credential(email, passwordValue);
      await reauthenticateWithCredential(user, credential);
      passedReauth = true;
      onAfterReauth?.();
      const token = await user.getIdToken();
      const data = await setCapital(token, cajaObjetivo + sumaCapitalAdmins);
      onSuccess(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al verificar.";
      const isPwd =
        msg.includes("wrong-password") ||
        msg.includes("invalid-credential") ||
        msg.includes("invalid-password");
      if (!passedReauth) {
        if (isPwd) setPasswordError("Contraseña incorrecta.");
        else setPasswordError(msg);
      } else {
        onSaveError?.(msg);
      }
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div
      className="gf-modal-backdrop"
      onClick={() => {
        if (!isConfirming) onClose();
      }}
      aria-hidden
    >
      <div
        className="gf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gf-modal-title"
        aria-describedby="gf-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gf-modal-title" className="gf-modal-title">
          Cuadrar caja
        </h2>
        <p id="gf-modal-desc" className="gf-modal-desc">
          Vas a <strong>cuadrar la caja de la empresa</strong> con saldo{" "}
          <span className="gf-modal-monto">${formatMonto(cajaObjetivo)}</span>. El capital
          total pasará a{" "}
          <span className="gf-modal-monto">${formatMonto(cajaObjetivo + sumaCapitalAdmins)}</span> (caja de la empresa + Σ
          administradores). La caja de la empresa quedará en ese saldo. Escribe tu contraseña dos
          veces para confirmar.
        </p>
        <label htmlFor="gf-modal-password" className="gf-modal-label">
          Contraseña
        </label>
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
        />
        {passwordError && (
          <p className="gf-capital-input-msg-error" role="alert">
            {passwordError}
          </p>
        )}
        <div className="gf-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isConfirming}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirmar} disabled={isConfirming}>
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
  );
}
