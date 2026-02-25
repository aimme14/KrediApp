"use client";

import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";

export default function DeshabilitadoPage() {
  const { signOut } = useAuth();

  return (
    <div className="container" style={{ paddingTop: "4rem", textAlign: "center", position: "relative" }}>
      <div style={{ position: "absolute", top: "1rem", right: "1.5rem" }}>
        <ThemeToggle />
      </div>
      <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
        <h1 className="page-title">Cuenta deshabilitada</h1>
        <p style={{ color: "var(--text-muted)" }}>
          Tu cuenta ha sido deshabilitada. Contacta al Super Administrador si crees que es un error.
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => signOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
