"use client";

import { useState } from "react";

type Periodo = "diario" | "semanal" | "mensual";

export default function ResumenEconomicoPage() {
  const [periodo, setPeriodo] = useState<Periodo>("diario");

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Resumen Económico</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Balance por rutas y global (diario, semanal y mensual).
        </p>
        <div className="jefe-resumen-tabs">
          {(["diario", "semanal", "mensual"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`jefe-resumen-tab ${periodo === p ? "jefe-resumen-tab-active" : ""}`}
              onClick={() => setPeriodo(p)}
            >
              {p === "diario" ? "Diario" : p === "semanal" ? "Semanal" : "Mensual"}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Por ruta</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Balance {periodo} de cada ruta por separado.
        </p>
        <div className="jefe-resumen-placeholder">
          <p>Aquí se mostrará el balance {periodo} por ruta cuando existan datos.</p>
          <ul style={{ margin: "0.5rem 0 0 1.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            <li>Ruta A: —</li>
            <li>Ruta B: —</li>
            <li>Ruta C: —</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Global</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Balance {periodo} total (todas las rutas).
        </p>
        <div className="jefe-resumen-placeholder">
          <p>Aquí se mostrará el balance {periodo} global cuando existan datos.</p>
          <p style={{ marginTop: "0.5rem", fontWeight: 600, fontSize: "1.125rem" }}>Total: —</p>
        </div>
      </div>
    </>
  );
}
