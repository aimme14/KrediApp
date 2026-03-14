"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const { signIn, error, clearError } = useAuth();

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setIsSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      // Error ya se muestra en state
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="email">Correo</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={isSubmitting}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>
      <div className="form-group">
        <label htmlFor="password">Contraseña</label>
        <div className="password-input-wrap">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-describedby={error ? "login-error" : undefined}
          />
          <button
            type="button"
            className="btn-password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            disabled={isSubmitting}
          >
            {showPassword ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>
      {error && (
        <p
          id="login-error"
          ref={errorRef}
          className="error-msg"
          role="alert"
          tabIndex={-1}
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: "100%", marginTop: "0.5rem" }}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Iniciando sesión…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
