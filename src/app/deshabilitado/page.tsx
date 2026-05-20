"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";

export default function DeshabilitadoPage() {
  const router = useRouter();
  const { signOut, profile, loading } = useAuth();
  const esTrabajador = profile?.role === "trabajador";

  const handleCerrarSesion = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <div className="container" style={{ paddingTop: "4rem", textAlign: "center", position: "relative" }}>
      <div style={{ position: "absolute", top: "1rem", right: "1.5rem" }}>
        <ThemeToggle />
      </div>
      <div className="card" style={{ maxWidth: 400, margin: "0 auto" }}>
        {loading ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Cargando…</p>
        ) : esTrabajador ? (
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Horario no laboral
          </h1>
        ) : (
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Acceso no disponible
          </h1>
        )}
        {!loading && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCerrarSesion}
            style={{ marginTop: "1.25rem" }}
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  );
}
