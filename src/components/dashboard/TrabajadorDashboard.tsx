"use client";

import { useAuth } from "@/context/AuthContext";

export default function TrabajadorDashboard() {
  const { profile } = useAuth();

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Panel Trabajador</h2>
      <p style={{ color: "var(--text-muted)" }}>
        Hola{profile?.displayName ? `, ${profile.displayName}` : ""}. Estás en el panel de trabajador.
      </p>
      <p style={{ color: "#71717a", fontSize: "0.875rem" }}>
        Aquí puedes añadir más contenido específico para el rol de trabajador cuando lo necesites
        (información, tareas, reportes, etc.).
      </p>
    </div>
  );
}
