"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { listClientes, listPrestamos, createPrestamo, type ClienteItem, type PrestamoItem } from "@/lib/empresa-api";

const MODALIDADES = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
] as const;

export default function PrestamoTrabajadorPage() {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [modalidad, setModalidad] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState(12);
  const [interes, setInteres] = useState(0);
  const [monto, setMonto] = useState("");
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
        interes,
        modalidad,
        numeroCuotas,
        fechaInicio: fechaInicio || undefined,
      });
      setClienteId("");
      setMonto("");
      setNumeroCuotas(12);
      setInteres(0);
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
          <input type="number" min={1} value={numeroCuotas} onChange={(e) => setNumeroCuotas(parseInt(e.target.value, 10) || 1)} required />
        </div>
        <div className="form-group">
          <label>Interés (%)</label>
          <input type="number" min={0} step={0.1} value={interes} onChange={(e) => setInteres(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="form-group">
          <label>Cantidad a prestar</label>
          <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required placeholder="Monto" />
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
