"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useJornada } from "@/hooks/useJornada";

const CATEGORIAS: { value: "transporte" | "alimentacion" | "otro"; label: string }[] = [
  { value: "transporte", label: "Transporte" },
  { value: "alimentacion", label: "Alimentación" },
  { value: "otro", label: "Otro" },
];

function formatCurrency(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

export default function RegistrarGastoPage() {
  const { profile } = useAuth();
  const { jornadaActiva, loading, error, registrarGasto } = useJornada();
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState<"transporte" | "alimentacion" | "otro">("transporte");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exito, setExito] = useState(false);
  const [ultimoMonto, setUltimoMonto] = useState(0);

  const montoNum = (() => {
    const n = parseFloat(monto.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();
  const cajaActual = jornadaActiva?.cajaActual ?? 0;
  const puedeConfirmar = montoNum > 0 && descripcion.trim().length > 0 && montoNum <= cajaActual;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeConfirmar) return;
    setSubmitting(true);
    try {
      await registrarGasto(montoNum, descripcion.trim(), categoria);
      setUltimoMonto(montoNum);
      setExito(true);
      setMonto("");
      setDescripcion("");
    } finally {
      setSubmitting(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;

  if (!jornadaActiva) {
    return (
      <div className="card registrar-gasto-card">
        <h2 className="registrar-gasto-title">Registrar gasto</h2>
        <p className="registrar-gasto-sin-jornada">
          No tienes una jornada activa. Inicia la jornada desde la Ruta del día para poder registrar gastos desde tu base.
        </p>
        <Link href="/dashboard/trabajador/ruta" className="btn btn-primary">Ir a Ruta del día</Link>
      </div>
    );
  }

  if (exito) {
    return (
      <div className="card registrar-gasto-card registrar-gasto-confirmacion">
        <h2 className="registrar-gasto-title">Gasto registrado</h2>
        <p>Se descontó {formatCurrency(ultimoMonto)} de tu base. El saldo se actualizará al instante.</p>
        <div className="registrar-gasto-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setExito(false)}>
            Registrar otro
          </button>
          <Link href="/dashboard/trabajador/ruta" className="btn btn-primary">Volver a Ruta del día</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card registrar-gasto-card">
      <div className="registrar-gasto-header">
        <Link href="/dashboard/trabajador/ruta" className="registrar-gasto-back">← Ruta del día</Link>
        <h2 className="registrar-gasto-title">Registrar gasto</h2>
        <p className="registrar-gasto-saldo">
          Saldo actual en base: <strong>{formatCurrency(cajaActual)}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="registrar-gasto-form">
        <div className="form-group">
          <label>Monto</label>
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
            className="registrar-gasto-input"
          />
          {montoNum > cajaActual && (
            <p className="error-msg">El monto no puede superar el saldo en base ({formatCurrency(cajaActual)}).</p>
          )}
        </div>

        <div className="form-group">
          <label>Categoría</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as "transporte" | "alimentacion" | "otro")}
            className="registrar-gasto-select"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Descripción (obligatorio)</label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: pasaje, almuerzo, fotocopias..."
            className="registrar-gasto-input"
          />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!puedeConfirmar || submitting}
        >
          {submitting ? "Registrando..." : "Confirmar gasto"}
        </button>
      </form>
    </div>
  );
}
