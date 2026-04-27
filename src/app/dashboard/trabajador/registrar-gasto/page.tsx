"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { EMPRESAS_COLLECTION, USUARIOS_SUBCOLLECTION } from "@/lib/empresas-db";
import { createGasto } from "@/lib/empresa-api";

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
  const { user, profile } = useAuth();
  const [cajaEmpleado, setCajaEmpleado] = useState<number | null>(null);
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState<"transporte" | "alimentacion" | "otro">("transporte");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [ultimoMonto, setUltimoMonto] = useState(0);

  useEffect(() => {
    if (!user || !profile?.empresaId || profile.role !== "trabajador") {
      setCajaEmpleado(null);
      return;
    }
    if (!db) {
      setCajaEmpleado(0);
      return;
    }
    const ref = doc(db, EMPRESAS_COLLECTION, profile.empresaId, USUARIOS_SUBCOLLECTION, user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const v = snap.data()?.cajaEmpleado;
      setCajaEmpleado(typeof v === "number" ? v : 0);
    });
    return () => unsub();
  }, [user, profile?.empresaId, profile?.role]);

  const montoNum = (() => {
    const n = parseFloat(monto.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();
  const saldo = cajaEmpleado ?? 0;
  const puedeConfirmar = montoNum > 0 && descripcion.trim().length > 0 && montoNum <= saldo;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeConfirmar || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      await createGasto(token, {
        descripcion: descripcion.trim(),
        monto: montoNum,
        tipo: categoria,
      });
      setUltimoMonto(montoNum);
      setExito(true);
      setMonto("");
      setDescripcion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar gasto");
    } finally {
      setSubmitting(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;

  if (cajaEmpleado === null) {
    return (
      <div className="card registrar-gasto-card">
        <h2 className="registrar-gasto-title">Registrar gasto</h2>
        <p style={{ color: "var(--text-muted)" }}>Cargando saldo…</p>
      </div>
    );
  }

  if (exito) {
    return (
      <div className="card registrar-gasto-card registrar-gasto-confirmacion">
        <h2 className="registrar-gasto-title">Gasto registrado</h2>
        <p>Se descontó {formatCurrency(ultimoMonto)} de tu caja. El saldo se actualizará al instante.</p>
        <div className="registrar-gasto-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setExito(false)}>
            Registrar otro
          </button>
          <Link href="/dashboard/trabajador/ruta" className="btn btn-primary">
            Volver a Ruta del día
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card registrar-gasto-card">
      <div className="registrar-gasto-header">
        <Link href="/dashboard/trabajador/ruta" className="registrar-gasto-back">
          ← Ruta del día
        </Link>
        <h2 className="registrar-gasto-title">Registrar gasto</h2>
        <p className="registrar-gasto-saldo">
          Saldo actual en caja: <strong>{formatCurrency(saldo)}</strong>
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
          {montoNum > saldo && (
            <p className="error-msg">
              El monto no puede superar el saldo en caja ({formatCurrency(saldo)}).
            </p>
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
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
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

        <button type="submit" className="btn btn-primary" disabled={!puedeConfirmar || submitting}>
          {submitting ? "Registrando..." : "Confirmar gasto"}
        </button>
      </form>
    </div>
  );
}
