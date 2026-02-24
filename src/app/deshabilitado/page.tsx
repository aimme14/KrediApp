"use client";

import { useAuth } from "@/context/AuthContext";

export default function DeshabilitadoPage() {
  const { signOut } = useAuth();

  return (
    <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
      <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>Cuenta deshabilitada</h1>
        <p style={{ color: "#a1a1aa" }}>
          Tu cuenta ha sido deshabilitada. Contacta al Super Administrador si crees que es un error.
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => signOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
