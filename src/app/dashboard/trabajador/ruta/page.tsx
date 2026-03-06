"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { listClientes, listPrestamos, registrarPago } from "@/lib/empresa-api";
import { uploadImage, getImageAccept } from "@/lib/storage";
import type { ClienteItem } from "@/lib/empresa-api";
import type { PrestamoItem } from "@/lib/empresa-api";

type StatusColor = "red" | "yellow" | "green";

function getStatusColor(prestamo: PrestamoItem | null): StatusColor {
  if (!prestamo) return "green";
  if (prestamo.estado === "mora") return "red";
  if (prestamo.saldoPendiente <= 0) return "green";
  return "yellow";
}

export default function RutaDelDiaPage() {
  const { user, profile } = useAuth();
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<ClienteItem | null>(null);
  const [prestamoCliente, setPrestamoCliente] = useState<PrestamoItem | null>(null);
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">("efectivo");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
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
    load();
  }, [load]);

  const getPrestamoForCliente = (clienteId: string) =>
    prestamos.find((p) => p.clienteId === clienteId && p.estado !== "pagado") ?? null;

  const handleSelectCliente = (c: ClienteItem) => {
    setSelectedCliente(c);
    setPrestamoCliente(getPrestamoForCliente(c.id));
    setMonto("");
    setEvidenciaFile(null);
  };

  const handleRegistrarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !prestamoCliente || !selectedCliente) return;
    const montoNum = parseFloat(monto.replace(",", "."));
    if (isNaN(montoNum) || montoNum <= 0) {
      setError("Monto debe ser positivo");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      let evidenciaUrl = "";
      if (evidenciaFile) {
        evidenciaUrl = await uploadImage(evidenciaFile, {
          folder: "pagos",
          ownerId: user.uid,
          filename: "auto",
        });
      }
      const token = await user.getIdToken();
      await registrarPago(token, prestamoCliente.id, {
        monto: montoNum,
        metodoPago,
        evidencia: evidenciaUrl || undefined,
      });
      setMonto("");
      setSelectedCliente(null);
      setPrestamoCliente(null);
      setEvidenciaFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar pago");
    } finally {
      setSubmitting(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Ruta del día</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Clientes a visitar. Rojo: no pagó / mora. Amarillo: pendiente de cobro. Verde: al día. Selecciona un cliente para registrar el pago (efectivo o transferencia y foto de evidencia).
      </p>

      {error && <p className="error-msg">{error}</p>}

      {loading ? (
        <p>Cargando clientes...</p>
      ) : clientes.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No tienes clientes asignados en tu ruta.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            {clientes.map((c) => {
              const p = getPrestamoForCliente(c.id);
              const color = getStatusColor(p);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCliente(c)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    border: `2px solid ${color === "red" ? "#dc2626" : color === "yellow" ? "#ca8a04" : "#16a34a"}`,
                    background: selectedCliente?.id === c.id ? (color === "red" ? "#fef2f2" : color === "yellow" ? "#fefce8" : "#f0fdf4") : "transparent",
                    cursor: "pointer",
                    fontWeight: selectedCliente?.id === c.id ? 600 : 400,
                  }}
                >
                  {c.nombre}
                </button>
              );
            })}
          </div>

          {selectedCliente && (
            <div className="card" style={{ marginTop: "1rem" }}>
              <h3 style={{ marginTop: 0 }}>{selectedCliente.nombre}</h3>
              <p style={{ margin: "0 0 0.5rem 0" }}>Tel: {selectedCliente.telefono || "—"} · Cédula: {selectedCliente.cedula || "—"}</p>
              {prestamoCliente ? (
                <>
                  <p style={{ margin: "0 0 1rem 0" }}>
                    Préstamo: saldo pendiente <strong>{prestamoCliente.saldoPendiente.toFixed(2)}</strong> · Estado: {prestamoCliente.estado}
                  </p>
                  <form onSubmit={handleRegistrarPago}>
                    <div className="form-group">
                      <label>Monto a cobrar</label>
                      <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required placeholder="0.00" />
                    </div>
                    <div className="form-group">
                      <label>Tipo de pago</label>
                      <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as "efectivo" | "transferencia")} style={{ width: "100%", padding: "0.5rem" }}>
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Evidencia (foto)</label>
                      <input
                        type="file"
                        accept={getImageAccept()}
                        onChange={(e) => setEvidenciaFile(e.target.files?.[0] ?? null)}
                        style={{ display: "block" }}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? "Registrando..." : "Registrar pago"}
                    </button>
                  </form>
                </>
              ) : (
                <p style={{ color: "var(--text-muted)" }}>Sin préstamo activo (al día).</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
