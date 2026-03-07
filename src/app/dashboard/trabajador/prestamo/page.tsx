"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { listClientes, listPrestamos, createPrestamo, type ClienteItem, type PrestamoItem } from "@/lib/empresa-api";

const MODALIDADES = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
] as const;

/** Formato moneda: miles con punto, decimales con coma (ej: 1.234,56) */
function formatMoneda(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "";
  const [entero, dec = ""] = n.toFixed(2).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos},${dec}`;
}

export default function PrestamoTrabajadorPage() {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [modalidad, setModalidad] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState("");
  const [interes, setInteres] = useState("");
  const [monto, setMonto] = useState("");
  const [montoFocused, setMontoFocused] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    Promise.all([listClientes(token), listPrestamos(token)])
      .then(([c, p]) => {
        setClientes(c);
        setPrestamos(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const montoNum = parseFloat(monto.replace(",", "."));
    if (isNaN(montoNum) || montoNum <= 0) {
      setError("Monto debe ser un número positivo");
      return;
    }
    if (!clienteId.trim()) {
      setError("Selecciona un cliente");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const token = await user.getIdToken();
      await createPrestamo(token, {
        clienteId: clienteId.trim(),
        monto: montoNum,
        interes: parseFloat(interes.replace(",", ".")) || 0,
        modalidad,
        numeroCuotas: Math.max(1, parseInt(numeroCuotas, 10) || 1),
        fechaInicio: fechaInicio || undefined,
      });
      setClienteId("");
      setMonto("");
      setNumeroCuotas("");
      setInteres("");
      setModalidad("mensual");
      setFechaInicio(new Date().toISOString().slice(0, 10));
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear préstamo");
    } finally {
      setCreating(false);
    }
  };

  const clientesSinPrestamo = clientes.filter((c) => !c.prestamo_activo && !c.moroso);

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Creación de préstamo</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Selecciona el cliente, fecha del préstamo, frecuencia de pago, número de cuotas, interés y cantidad a prestar.
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>Nuevo préstamo</h3>
        <div className="form-group">
          <label>Cliente</label>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required style={{ width: "100%", padding: "0.5rem" }}>
            <option value="">Seleccionar cliente</option>
            {clientesSinPrestamo.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} {c.cedula ? `· ${c.cedula}` : ""}</option>
            ))}
            {clientesSinPrestamo.length === 0 && clientes.length > 0 && (
              <option value="" disabled>Todos los clientes tienen préstamo activo o son morosos</option>
            )}
          </select>
        </div>
        <div className="form-group">
          <label>Fecha del préstamo</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Frecuencia de pago</label>
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value as "diario" | "semanal" | "mensual")} style={{ width: "100%", padding: "0.5rem" }}>
            {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
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
            required
            aria-label="Número de cuotas"
          />
        </div>
        <div className="form-group">
          <label>Interés (%)</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            max={999.99}
            value={interes}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (v === "" || /^\d*\.?\d*$/.test(v)) setInteres(e.target.value);
            }}
            onKeyDown={(e) => {
              const k = e.key;
              if (k === "e" || k === "E" || k === "+" || k === "-") e.preventDefault();
            }}
            placeholder="Ej: 10"
            aria-label="Interés en porcentaje"
          />
        </div>
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
            required
            placeholder="0,00"
          />
        </div>
        <div className="form-group">
          <label>Cuota diaria</label>
          <input
            type="text"
            readOnly
            value={
              (() => {
                const montoNum = parseFloat(monto.replace(",", "."));
                const nCuotas = parseInt(numeroCuotas, 10);
                const iVal = parseFloat(interes.replace(",", ".")) || 0;
                if (isNaN(montoNum) || montoNum <= 0 || !nCuotas || nCuotas < 1) return "—";
                const total = montoNum * (1 + iVal / 100);
                return formatMoneda(total / nCuotas);
              })()
            }
            aria-label="Cuota diaria (calculada)"
            style={{ backgroundColor: "var(--bg)", cursor: "default" }}
          />
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem", marginBottom: 0 }}>
            (Cantidad a prestar × (1 + interés %) ÷ número de cuotas)
          </p>
        </div>
        {error && <p className="error-msg">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? "Creando..." : "Crear préstamo"}
        </button>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Préstamos de tu ruta</h3>
        {loading ? <p>Cargando...</p> : prestamos.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay préstamos.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cliente ID</th><th>Monto</th><th>Total a pagar</th><th>Saldo</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {prestamos.slice(0, 20).map((p) => (
                  <tr key={p.id}>
                    <td>{p.clienteId}</td>
                    <td>{p.monto}</td>
                    <td>{p.totalAPagar.toFixed(2)}</td>
                    <td>{p.saldoPendiente.toFixed(2)}</td>
                    <td>{p.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
