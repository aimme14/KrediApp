"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import LoginForm from "@/components/LoginForm";

function LoginFormSignOut() {
  const { signOut } = useAuth();
  return (
    <button type="button" className="btn btn-secondary" onClick={() => signOut()} style={{ width: "100%" }}>
      Cerrar sesión
    </button>
  );
}

export default function HomePage() {
  const { user, profile, loading, isEnabled } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      if (!isEnabled()) {
        window.location.href = "/deshabilitado";
        return;
      }
      window.location.href = "/dashboard";
      return;
    }
  }, [user, profile, loading, isEnabled]);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (user && profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Redirigiendo al panel...</p>
      </div>
    );
  }

  // Usuario autenticado pero sin perfil en Firestore (no puede entrar al panel)
  if (user && !profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem" }}>
        <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0, marginBottom: "1rem" }}>KrediApp</h1>
          <p className="error-msg" style={{ marginBottom: "1rem" }}>
            Tu cuenta no tiene un perfil asignado en la aplicación. Contacta al Super Administrador o al responsable para que te den de alta.
          </p>
          <LoginFormSignOut />
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: "4rem" }}>
      <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0, marginBottom: "1rem" }}>KrediApp</h1>
        <p style={{ color: "#a1a1aa", marginBottom: "1.5rem" }}>
          Inicia sesión con tu cuenta
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
