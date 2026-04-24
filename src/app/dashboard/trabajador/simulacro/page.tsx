"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { parseInteresPct } from "@/lib/interes-pct";

const MODALIDADES = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
] as const;

/** Formato moneda: miles con punto; decimales con coma solo si son distintos de cero (ej: 1.234 o 1.234,56) */
function formatMoneda(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "";
  const [entero, dec = ""] = n.toFixed(2).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decTrim = dec.replace(/0+$/, "");
  return decTrim ? `${conPuntos},${decTrim}` : conPuntos;
}

function calcularTotal(monto: number, interesPct: number, numeroCuotas: number, modalidad: string) {
  const totalAPagar = monto * (1 + interesPct / 100);
  const cuota = totalAPagar / numeroCuotas;
  return { totalAPagar, cuota };
}

export default function SimulacroPrestamoPage() {
  const { profile } = useAuth();
  const [modalidad, setModalidad] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState("");
  const [interes, setInteres] = useState("");
  const [monto, setMonto] = useState("");
  const [montoFocused, setMontoFocused] = useState(false);

  const montoNum = parseFloat(monto.replace(",", ".")) || 0;
  const nCuotas = Math.max(1, parseInt(numeroCuotas, 10) || 1);
  const iVal = parseInteresPct(interes);
  const { totalAPagar, cuota } = montoNum > 0
    ? calcularTotal(montoNum, iVal, nCuotas, modalidad)
    : { totalAPagar: 0, cuota: 0 };

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Simulador de Crédito</h2>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Datos del simulador</h3>
        <div className="form-group">
          <label>Cantidad a prestar</label>
          <input
            type="text"
            inputMode="decimal"
            value={
              montoFocused
                ? monto
                : (monto ? formatMoneda(parseFloat(monto.replace(",", ".")) || 0) : "")
            }
            onChange={(e) => {
              let v = e.target.value.replace(/\./g, "").replace(/[^\d,]/g, "");
              if ((v.match(/,/g) || []).length > 1) return;
              setMonto(v);
            }}
            onFocus={() => setMontoFocused(true)}
            onBlur={() => setMontoFocused(false)}
            placeholder="0,00"
            aria-label="Cantidad a prestar"
          />
        </div>
        <div className="simulador-form-row">
          <div className="form-group">
            <label>Número de cuotas</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              value={numeroCuotas}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (v === "" || /^\d+$/.test(v)) setNumeroCuotas(v);
              }}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "e" || k === "E" || k === "+" || k === "-" || k === "." || k === ",") e.preventDefault();
              }}
              placeholder="Ej: 12"
              aria-label="Número de cuotas"
            />
          </div>
          <div className="form-group">
            <label>Interés (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={interes}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v === "" || /^\d*\.?\d*$/.test(v)) setInteres(v);
              }}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "e" || k === "E" || k === "+" || k === "-") e.preventDefault();
              }}
              placeholder="Ej: 10"
              aria-label="Interés en porcentaje"
            />
          </div>
        </div>
        <div className="form-group">
          <label>Frecuencia de pago</label>
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value as "diario" | "semanal" | "mensual")} style={{ width: "100%", padding: "0.5rem" }} aria-label="Frecuencia de pago">
            {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {montoNum > 0 && (
        <div className="card simulador-resultado-card">
          <h3 style={{ marginTop: 0 }}>Resultado</h3>
          <p><strong>Cuota por período ({modalidad}):</strong> {formatMoneda(cuota)}</p>
          <p><strong>Total a pagar:</strong> {formatMoneda(totalAPagar)}</p>
        </div>
      )}
    </div>
  );
}
