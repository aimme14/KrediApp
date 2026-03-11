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

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const MOTIVO_MAX_LEN = 25;
function truncarMotivo(s: string) {
  if (!s) return "—";
  return s.length <= MOTIVO_MAX_LEN ? s : s.slice(0, MOTIVO_MAX_LEN) + "…";
}

export default function GastosTrabajadorPage() {
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
  const [motivoOverlay, setMotivoOverlay] = useState<string | null>(null);
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
    setEvidenciaPreview(URL.createObjectURL(file));
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

  if (!profile || profile.role !== "trabajador") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Gastos operativos</h2>

      {showForm && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Registrar gasto</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Motivo</label>
              <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} required placeholder="Descripción del gasto" />
            </div>
            <div className="form-group">
              <label>Monto</label>
              <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "transporte" | "alimentacion" | "otro")} style={{ width: "100%", padding: "0.5rem" }}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Evidencia (foto de factura o comprobante)</label>
              <input ref={fileInputRef} type="file" accept={getImageAccept()} onChange={handleFileChange} style={{ display: "block" }} />
              {evidenciaPreview && (
                <div style={{ marginTop: "0.5rem" }}>
                  <img src={evidenciaPreview} alt="Vista previa" style={{ maxWidth: "200px", maxHeight: "150px", objectFit: "contain", borderRadius: "4px" }} />
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
        <div className="card-header-row" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Historial de gastos</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}
            aria-label={showForm ? "Cerrar formulario" : "Nuevo gasto"}
            title={showForm ? "Cerrar" : "Nuevo gasto"}
          >
            {showForm ? <CloseIcon /> : <PlusIcon />}
          </button>
        </div>
        {loading ? <p>Cargando...</p> : gastos.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No hay gastos registrados.</p>
        ) : (
          <div className="table-wrap gastos-table-wrap">
            <table className="gastos-table">
              <thead>
                <tr><th>Fecha</th><th>Motivo</th><th>Tipo</th><th>Monto</th><th>Evidencia</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td>{g.fecha ? new Date(g.fecha).toLocaleDateString() : "—"}</td>
                    <td>{truncarMotivo(g.descripcion ?? "")}</td>
                    <td>{g.tipo}</td>
                    <td>{g.monto.toFixed(2)}</td>
                    <td>{g.evidencia ? <a href={g.evidencia} target="_blank" rel="noopener noreferrer">Ver comprobante</a> : "—"}</td>
                    <td>
                      {g.descripcion ? (
                        <button
                          type="button"
                          className="gastos-ver-motivo-btn"
                          onClick={() => setMotivoOverlay(g.descripcion)}
                          aria-label="Ver motivo completo"
                        >
                          Ver
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {motivoOverlay !== null && (
        <div className="gastos-motivo-overlay" role="dialog" aria-modal="true" aria-label="Motivo del gasto">
          <div className="gastos-motivo-overlay-backdrop" onClick={() => setMotivoOverlay(null)} aria-hidden />
          <div className="gastos-motivo-overlay-box">
            <p className="gastos-motivo-overlay-text">{motivoOverlay}</p>
            <button type="button" className="btn btn-primary" onClick={() => setMotivoOverlay(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
