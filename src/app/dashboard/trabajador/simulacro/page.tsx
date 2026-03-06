"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const MODALIDADES = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
] as const;

function calcularTotal(monto: number, interesPct: number, numeroCuotas: number, modalidad: string) {
  const totalAPagar = monto * (1 + interesPct / 100);
  let cuota = 0;
  if (modalidad === "diario") cuota = totalAPagar / numeroCuotas;
  else if (modalidad === "semanal") cuota = totalAPagar / numeroCuotas;
  else cuota = totalAPagar / numeroCuotas;
  return { totalAPagar, cuota };
}

export default function SimulacroPrestamoPage() {
  const { profile } = useAuth();
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [modalidad, setModalidad] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState(12);
  const [interes, setInteres] = useState(0);
  const [monto, setMonto] = useState("");

  const montoNum = parseFloat(monto.replace(",", ".")) || 0;
  const { totalAPagar, cuota } = montoNum > 0
    ? calcularTotal(montoNum, interes, numeroCuotas, modalidad)
    : { totalAPagar: 0, cuota: 0 };

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Simulacro de préstamo</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Misma información que la creación de préstamo, pero solo para mostrar al cliente cuánto quedaría la deuda sin generar el préstamo.
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Datos del simulacro</h3>
        <div className="form-group">
          <label>Fecha del préstamo</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Frecuencia de pago</label>
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value as "diario" | "semanal" | "mensual")} style={{ width: "100%", padding: "0.5rem" }}>
            {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Número de cuotas</label>
          <input type="number" min={1} value={numeroCuotas} onChange={(e) => setNumeroCuotas(parseInt(e.target.value, 10) || 1)} />
        </div>
        <div className="form-group">
          <label>Interés (%)</label>
          <input type="number" min={0} step={0.1} value={interes} onChange={(e) => setInteres(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="form-group">
          <label>Cantidad a prestar</label>
          <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto" />
        </div>
      </div>

      {montoNum > 0 && (
        <div className="card" style={{ background: "var(--success-bg, #f0fdf4)", border: "1px solid var(--success-text, #16a34a)" }}>
          <h3 style={{ marginTop: 0 }}>Resultado del simulacro</h3>
          <p><strong>Total a pagar:</strong> {totalAPagar.toFixed(2)}</p>
          <p><strong>Cuota por período ({modalidad}):</strong> {cuota.toFixed(2)}</p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Este cálculo es solo orientativo. No se ha creado ningún préstamo.</p>
        </div>
      )}
    </div>
  );
}
