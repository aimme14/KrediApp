"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import styles from "@/components/login/loginForm.module.css";
import { IconEye, IconEyeOff, IconLock, IconLogin, IconMail } from "@/components/login/loginIcons";

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
    <form className={styles.form} onSubmit={handleSubmit}>
      <header className={styles.formHeader}>
        <h2 id="login-heading" className={styles.formTitle}>
          Bienvenido de nuevo
        </h2>
        <p className={styles.formSub}>Ingresa tus credenciales para continuar</p>
      </header>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Correo electrónico
        </label>
        <div className={styles.inputWrap}>
          <span className={styles.inputIcon}>
            <IconMail />
          </span>
          <input
            id="email"
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={isSubmitting}
            placeholder="admin@krediapp.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          Contraseña
        </label>
        <div className={styles.inputWrap}>
          <span className={styles.inputIcon}>
            <IconLock />
          </span>
          <input
            id="password"
            className={`${styles.input} ${styles.inputWithEye}`}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={isSubmitting}
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
          <button
            type="button"
            className={styles.eyeBox}
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            disabled={isSubmitting}
          >
            {showPassword ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
      </div>

      {error ? (
        <p id="login-error" ref={errorRef} className={styles.error} role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}

      <button type="submit" className={styles.submit} disabled={isSubmitting}>
        <span className={styles.submitIcon}>
          <IconLogin />
        </span>
        {isSubmitting ? "Iniciando sesión…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
