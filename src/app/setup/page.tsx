"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SetupSuperAdminPage() {
  const [status, setStatus] = useState<"loading" | "available" | "unavailable" | "error">("loading");
  const [serverError, setServerError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setServerError("");
    fetch("/api/setup/super-admin")
      .then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || data.error) {
          setStatus("error");
          setServerError(data?.error || "Error al conectar con el servidor.");
          return;
        }
        setStatus(data.available ? "available" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setServerError("No se pudo conectar. ¿Está el servidor en marcha?");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear el Super Administrador.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Error de conexión. Vuelve a intentarlo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="container" style={{ paddingTop: "4rem" }}>
        <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>Configuración inicial</h1>
          <p className="error-msg">{serverError || "No se pudo comprobar el estado."}</p>
          <p style={{ fontSize: "0.875rem", color: "#a1a1aa", marginTop: "0.5rem" }}>
            Comprueba que en la raíz del proyecto exista <code>.env.local</code> con
            FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY. Reinicia el servidor (<code>npm run dev</code>) después de cambiar las variables.
          </p>
          <Link href="/" className="btn btn-secondary" style={{ marginTop: "1rem" }}>
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="container" style={{ paddingTop: "4rem" }}>
        <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>Configuración inicial</h1>
          <p style={{ color: "#a1a1aa", marginBottom: "1.5rem" }}>
            Ya existe un Super Administrador. Inicia sesión con tu cuenta.
          </p>
          <Link href="/" className="btn btn-primary">
            Ir a inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container" style={{ paddingTop: "4rem" }}>
        <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>Super Admin creado</h1>
          <p style={{ color: "#86efac", marginBottom: "1.5rem" }}>
            La cuenta de Super Administrador se creó correctamente. Ya puedes iniciar sesión.
          </p>
          <Link href="/" className="btn btn-primary">
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: "4rem" }}>
      <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Crear Super Administrador</h1>
        <p style={{ color: "#a1a1aa", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
          Primera vez: crea la cuenta que podrá gestionar jefes y la aplicación.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="setup-email">Correo</label>
            <input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="super@tudominio.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="setup-password">Contraseña</label>
            <div className="password-input-wrap">
              <input
                id="setup-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
              />
              <button
                type="button"
                className="btn-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="setup-confirm">Repetir contraseña</label>
            <input
              id="setup-confirm"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Repite la contraseña"
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "0.5rem" }}
            disabled={submitting}
          >
            {submitting ? "Creando…" : "Crear Super Administrador"}
          </button>
        </form>
        <p style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.875rem" }}>
          <Link href="/">¿Ya tienes cuenta? Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
