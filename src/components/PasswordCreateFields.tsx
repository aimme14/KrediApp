"use client";

import { useState } from "react";

function IconEye() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export type PasswordCreateFieldsProps = {
  password: string;
  passwordConfirm: string;
  onPasswordChange: (value: string) => void;
  onPasswordConfirmChange: (value: string) => void;
  disabled?: boolean;
  /** Clase extra del input (p. ej. admin-jefe-input). */
  inputClassName?: string;
  passwordId?: string;
  confirmId?: string;
  passwordLabel?: string;
  confirmLabel?: string;
  minLength?: number;
};

export default function PasswordCreateFields({
  password,
  passwordConfirm,
  onPasswordChange,
  onPasswordConfirmChange,
  disabled = false,
  inputClassName = "",
  passwordId = "create-user-password",
  confirmId = "create-user-password-confirm",
  passwordLabel = "Contraseña",
  confirmLabel = "Confirmar contraseña",
  minLength = 6,
}: PasswordCreateFieldsProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputClass = inputClassName.trim() ? inputClassName : undefined;

  return (
    <>
      <div className="form-group">
        <label htmlFor={passwordId} className={inputClassName?.includes("admin-jefe") ? "admin-jefe-label" : undefined}>
          {passwordLabel}
        </label>
        <div className="password-input-wrap">
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            required
            minLength={minLength}
            placeholder={`Mínimo ${minLength} caracteres`}
            className={inputClass}
            autoComplete="new-password"
            disabled={disabled}
            aria-required="true"
          />
          <button
            type="button"
            className="btn-password-toggle btn-password-toggle-icon"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            disabled={disabled}
          >
            {showPassword ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor={confirmId} className={inputClassName?.includes("admin-jefe") ? "admin-jefe-label" : undefined}>
          {confirmLabel}
        </label>
        <div className="password-input-wrap">
          <input
            id={confirmId}
            type={showPassword ? "text" : "password"}
            value={passwordConfirm}
            onChange={(e) => onPasswordConfirmChange(e.target.value)}
            required
            minLength={minLength}
            placeholder="Repite la contraseña"
            className={inputClass}
            autoComplete="new-password"
            disabled={disabled}
            aria-required="true"
          />
          <button
            type="button"
            className="btn-password-toggle btn-password-toggle-icon"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            disabled={disabled}
          >
            {showPassword ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
      </div>
    </>
  );
}
