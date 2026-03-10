"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { listGastos, createGasto, type GastoItem } from "@/lib/empresa-api";
import { uploadImage, IMAGE_ACCEPT, getImageAccept } from "@/lib/storage";

const TIPOS = [
  { value: "transporte", label: "Transporte" },
  { value: "alimentacion", label: "Alimentación" },
  { value: "otro", label: "Otro" },
] as const;

export default function GastosPage() {
  const { user, profile } = useAuth();
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState<"transporte" | "alimentacion" | "otro">("otro");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGastos = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    listGastos(token)
      .then(setGastos)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar gastos"))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadGastos();
  }, [loadGastos]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEvidenciaFile(file);
    const url = URL.createObjectURL(file);
    setEvidenciaPreview(url);
    return () => URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const montoNum = parseFloat(monto.replace(",", "."));
    if (isNaN(montoNum) || montoNum < 0) {
      setError("Monto debe ser un número mayor o igual a 0");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      let evidenciaUrl = "";
      if (evidenciaFile) {
        evidenciaUrl = await uploadImage(evidenciaFile, {
          folder: "gastos",
          ownerId: profile.uid,
          filename: "auto",
          acceptTypes: IMAGE_ACCEPT,
          maxSizeMB: 2,
        });
      }
      const token = await user.getIdToken();
      await createGasto(token, {
        descripcion: motivo.trim(),
        monto: montoNum,
        fecha: fecha || undefined,
        tipo,
        evidencia: evidenciaUrl || undefined,
      });
      setMotivo("");
      setMonto("");
      setFecha(new Date().toISOString().slice(0, 10));
      setTipo("otro");
      setEvidenciaFile(null);
      setEvidenciaPreview(null);
      setShowForm(false);
      await loadGastos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar gasto");
    } finally {
      setCreating(false);
    }
  };

  if (!profile || profile.role !== "admin") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Gastos operativos</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Registra gastos con fecha, motivo, monto y evidencia (foto de factura o comprobante). Aquí se muestra el historial de gastos.
      </p>

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancelar" : "Nuevo gasto"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Registrar gasto</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Motivo</label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
                placeholder="Descripción del gasto (ej. factura de combustible)"
              />
            </div>
            <div className="form-group">
              <label>Monto</label>
              <input
                type="text"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
                placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label>Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "transporte" | "alimentacion" | "otro")}
                style={{ width: "100%", padding: "0.5rem" }}
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Evidencia (foto de factura o comprobante)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={getImageAccept()}
                onChange={handleFileChange}
                style={{ display: "block", marginTop: "0.25rem" }}
                aria-label="Subir imagen del comprobante"
              />
              {evidenciaPreview && (
                <div style={{ marginTop: "0.5rem" }}>
                  <img
                    src={evidenciaPreview}
                    alt="Vista previa evidencia"
                    style={{ maxWidth: "200px", maxHeight: "150px", objectFit: "contain", borderRadius: "4px" }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: "0.25rem" }}
                    onClick={() => {
                      setEvidenciaFile(null);
                      setEvidenciaPreview(null);
                      fileInputRef.current?.value && (fileInputRef.current.value = "");
                    }}
                  >
                    Quitar imagen
                  </button>
                </div>
              )}
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "Guardando..." : "Registrar gasto"}
            </button>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Historial de gastos</h3>
        {loading ? (
          <p>Cargando...</p>
        ) : gastos.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay gastos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Motivo</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                  <th>Hecho por</th>
                  <th>Evidencia</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td>{g.fecha ? new Date(g.fecha).toLocaleDateString() : "—"}</td>
                    <td>{g.descripcion}</td>
                    <td>{g.tipo}</td>
                    <td>{g.monto.toFixed(2)}</td>
                    <td>{g.creadoPorNombre ?? "—"}</td>
                    <td>
                      {g.evidencia ? (
                        <a href={g.evidencia} target="_blank" rel="noopener noreferrer">
                          Ver comprobante
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
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
