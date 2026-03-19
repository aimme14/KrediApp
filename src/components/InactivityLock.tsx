"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/** Minutos de inactividad antes de bloquear la sesión. */
const INACTIVITY_MINUTES = 15;
/** Intervalo (ms) para comprobar si ya pasó el tiempo de inactividad. */
const CHECK_INTERVAL_MS = 30_000;

const INACTIVITY_MS = INACTIVITY_MINUTES * 60 * 1000;

export default function InactivityLock({ children }: { children: React.ReactNode }) {
  const { user, reauthWithPassword, signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    if (!user) return;

    const onActivity = () => {
      if (!lockedRef.current) lastActivityRef.current = Date.now();
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];
    events.forEach((ev) => window.addEventListener(ev, onActivity));

    const intervalId = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) {
        setLocked(true);
        setPassword("");
        setError(null);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      clearInterval(intervalId);
    };
  }, [user]);

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError("Escribe tu contraseña.");
      return;
    }
    setIsSubmitting(true);
    try {
      await reauthWithPassword(password);
      lastActivityRef.current = Date.now();
      setLocked(false);
      setPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Contraseña incorrecta. Intenta de nuevo.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSubmitting(true);
    try {
      await signOut();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return <>{children}</>;

  return (
    <>
      {children}

      {locked && (
        <div
          className="inactivity-lock-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inactivity-lock-title"
          aria-describedby="inactivity-lock-desc"
        >
          <div className="inactivity-lock-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="inactivity-lock-title" className="inactivity-lock-title">
              Sesión bloqueada por inactividad
            </h2>
            <p id="inactivity-lock-desc" className="inactivity-lock-desc">
              Llevas más de {INACTIVITY_MINUTES} minutos sin actividad. Ingresa tu contraseña para continuar.
            </p>
            <p className="inactivity-lock-email" aria-hidden>
              {user.email ?? "—"}
            </p>
            <form onSubmit={handleReauth}>
              <label htmlFor="inactivity-lock-password" className="gf-modal-label">
                Contraseña
              </label>
              <input
                id="inactivity-lock-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Tu contraseña"
                className={`gf-modal-input ${error ? "gf-capital-input-error" : ""}`}
                disabled={isSubmitting}
                autoComplete="current-password"
                autoFocus
                aria-invalid={!!error}
                aria-describedby={error ? "inactivity-lock-error" : undefined}
              />
              {error && (
                <p id="inactivity-lock-error" className="gf-capital-input-msg-error" role="alert">
                  {error}
                </p>
              )}
              <div className="gf-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSignOut}
                  disabled={isSubmitting}
                >
                  Cerrar sesión
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="gf-btn-spinner" aria-hidden />
                      Verificando…
                    </>
                  ) : (
                    "Continuar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
