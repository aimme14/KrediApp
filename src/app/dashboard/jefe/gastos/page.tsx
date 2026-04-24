"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { listGastos, createGasto, type GastoItem } from "@/lib/empresa-api";
import { uploadImage, IMAGE_ACCEPT, getImageAccept } from "@/lib/storage";

const TIPOS = [
  { value: "transporte", label: "Transporte", icon: "transporte" },
  { value: "alimentacion", label: "Alimentación", icon: "alimentacion" },
  { value: "otro", label: "Otro", icon: "otro" },
] as const;

function TransporteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18h2" />
      <path d="M19 18h2v-3.65a1 1 0 0 0-.22-.624L17 9h-5" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
function AlimentacionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}
function OtroIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}
function TipoIcon({ name }: { name: string }) {
  if (name === "transporte") return <TransporteIcon />;
  if (name === "alimentacion") return <AlimentacionIcon />;
  return <OtroIcon />;
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/** Formato de moneda: separador de miles y símbolo; decimales solo si hay céntimos no cero */
function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function tipoLabel(value: string): string {
  return TIPOS.find((t) => t.value === value)?.label ?? value;
}

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

export default function GastosPage() {
  const { user, profile } = useAuth();
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState<"transporte" | "alimentacion" | "otro">("otro");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [motivoOverlay, setMotivoOverlay] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const searchLower = searchQuery.trim().toLowerCase();
  const gastosFiltrados = searchLower
    ? gastos.filter((g) => {
        const motivo = (g.descripcion ?? "").toLowerCase();
        const tipo = (g.tipo ?? "").toLowerCase();
        const hechoPor = (g.creadoPorNombre ?? "").toLowerCase();
        const montoStr = (g.monto ?? 0).toFixed(2);
        const fechaStr = g.fecha ? new Date(g.fecha).toLocaleDateString().toLowerCase() : "";
        return (
          motivo.includes(searchLower) ||
          tipo.includes(searchLower) ||
          hechoPor.includes(searchLower) ||
          montoStr.includes(searchLower) ||
          fechaStr.includes(searchLower)
        );
      })
    : gastos;

  const gastosOrdenados = [...gastosFiltrados].sort((a, b) => {
    const timeA = new Date(a.fecha ?? 0).getTime();
    const timeB = new Date(b.fecha ?? 0).getTime();
    return timeB - timeA;
  });

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

  useEffect(() => {
    if (!showCamera) return;
    setCameraError(null);
    const video = videoRef.current;
    if (!video) return;
    const constraints: MediaStreamConstraints = { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      streamRef.current = stream;
      video.srcObject = stream;
    }).catch((err) => {
      setCameraError(err?.message || "No se pudo acceder a la cámara");
    });
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [showCamera]);

  const setFileFromInput = (file: File | null) => {
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    setEvidenciaFile(file);
    setEvidenciaPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileFromInput(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("gastos-upload-dragover");
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setFileFromInput(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    e.currentTarget.classList.add("gastos-upload-dragover");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("gastos-upload-dragover");
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "evidencia.png", { type: "image/png" });
      setFileFromInput(file);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
      setShowCamera(false);
    }, "image/png", 0.92);
  };

  const handleCloseCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setShowCamera(false);
    setCameraError(null);
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
        fecha: new Date().toISOString().slice(0, 10),
        tipo,
        evidencia: evidenciaUrl || undefined,
      });
      setMotivo("");
      setMonto("");
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

  if (!profile || profile.role !== "jefe") return null;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Gastos operativos</h2>
      <p style={{ color: "var(--text-muted)", marginTop: "-0.25rem", marginBottom: "1rem" }}>
        Los montos se descuentan de la caja de la empresa.
      </p>

      {showForm && (
        <div className="card gastos-form-card" style={{ marginBottom: "1rem" }}>
          <div className="card-header-row gastos-card-header">
            <h3 style={{ marginTop: 0 }}>Registrar gasto</h3>
            <button
              type="button"
              className="btn btn-secondary gastos-form-close-btn"
              onClick={() => setShowForm(false)}
              aria-label="Cerrar formulario"
              title="Cerrar"
            >
              <CloseIcon />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="gastos-form" noValidate>
            <div className="form-group">
              <label htmlFor="gastos-monto">Monto <span className="form-required" aria-hidden>*</span></label>
              <input
                id="gastos-monto"
                type="text"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
                placeholder="Ej: 15000"
                aria-required="true"
                aria-invalid={error ? true : undefined}
              />
            </div>

            <div className="form-group">
              <span className="gastos-tipo-label">Tipo de gasto <span className="form-required" aria-hidden>*</span></span>
              <div className="gastos-tipo-buttons" role="group" aria-label="Tipo de gasto">
                {TIPOS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`gastos-tipo-btn ${tipo === t.value ? "gastos-tipo-btn-active" : ""}`}
                    onClick={() => setTipo(t.value)}
                    aria-pressed={tipo === t.value}
                    aria-label={t.label}
                  >
                    <TipoIcon name={t.icon} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="gastos-motivo">Motivo <span className="form-required" aria-hidden>*</span></label>
              <input
                id="gastos-motivo"
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
                placeholder="Descripción del gasto (ej. factura de combustible)"
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label id="gastos-evidencia-label">Evidencia</label>
              {evidenciaPreview ? (
                <div className="gastos-evidencia-preview-wrap">
                  <div className="gastos-upload-preview">
                    <img src={evidenciaPreview} alt="Vista previa evidencia" />
                    <button
                      type="button"
                      className="gastos-upload-remove"
                      onClick={() => { setFileFromInput(null); fileInputRef.current && (fileInputRef.current.value = ""); }}
                      aria-label="Quitar imagen"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="gastos-evidencia-options">
                  <input
                    id="gastos-evidencia"
                    ref={fileInputRef}
                    type="file"
                    accept={getImageAccept()}
                    onChange={handleFileChange}
                    className="gastos-form-file-hidden"
                    aria-describedby="gastos-evidencia-hint"
                  />
                  <button
                    type="button"
                    className="gastos-evidencia-btn"
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    aria-labelledby="gastos-evidencia-label"
                    aria-describedby="gastos-evidencia-hint"
                  >
                    <UploadIcon />
                    <span>Subir foto</span>
                  </button>
                  <button
                    type="button"
                    className="gastos-evidencia-btn"
                    onClick={() => setShowCamera(true)}
                    aria-label="Tomar foto con la cámara"
                  >
                    <CameraIcon />
                    <span>Tomar foto</span>
                  </button>
                </div>
              )}
              <span id="gastos-evidencia-hint" className="gastos-upload-hint-inline">PNG o JPG — máx. 2 MB</span>
            </div>

            {showCamera && (
              <div className="gastos-camera-overlay" role="dialog" aria-modal="true" aria-label="Tomar foto">
                <div className="gastos-camera-backdrop" onClick={handleCloseCamera} aria-hidden />
                <div className="gastos-camera-box">
                  <div className="gastos-camera-header">
                    <h4 className="gastos-camera-title">Tomar foto</h4>
                    <button type="button" className="gastos-camera-close" onClick={handleCloseCamera} aria-label="Cerrar cámara">
                      <CloseIcon />
                    </button>
                  </div>
                  {cameraError ? (
                    <p className="gastos-camera-error">{cameraError}</p>
                  ) : (
                    <video ref={videoRef} autoPlay playsInline muted className="gastos-camera-video" />
                  )}
                  <div className="gastos-camera-actions">
                    <button type="button" className="btn btn-secondary" onClick={handleCloseCamera}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleCapturePhoto} disabled={!!cameraError}>
                      Capturar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && <p className="error-msg" role="alert" id="gastos-form-error">{error}</p>}
            <p className="form-required-hint" aria-hidden>* Campos requeridos</p>
            <div className="gastos-form-actions">
              <button type="submit" className="btn btn-primary" disabled={creating} aria-busy={creating}>
                {creating ? "Guardando..." : "Registrar gasto"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} aria-label="Cancelar y cerrar formulario">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && error && <p className="error-msg">{error}</p>}

      {!showForm && (
      <div className="card">
        <div className="card-header-row gastos-card-header">
          <div>
            <h3 style={{ marginTop: 0 }}>Historial de gastos</h3>
            {!loading && gastos.length > 0 && (
              <p className="gastos-registros-msg">
                {gastosOrdenados.length} registro{gastosOrdenados.length !== 1 ? "s" : ""} encontrado{gastosOrdenados.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <div className="gastos-header-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowForm((v) => !v)}
              aria-label={showForm ? "Cerrar formulario" : "Agregar gasto"}
              title={showForm ? "Cerrar" : "Agregar gasto"}
            >
              {showForm ? <CloseIcon /> : <PlusIcon />}
              {!showForm && <span className="gastos-btn-agregar-text">Agregar gasto</span>}
            </button>
          </div>
        </div>
        {loading ? (
          <p className="gastos-loading-msg">Cargando...</p>
        ) : gastos.length === 0 ? (
          <p className="gastos-empty-msg">No hay gastos registrados.</p>
        ) : (
          <>
            <div className="gastos-buscador-wrap">
              <input
                id="gastos-buscador"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, tipo, monto o fecha..."
                aria-label="Buscar en historial de gastos"
              />
              {searchQuery.trim() && (
                <p className="gastos-resultados-msg">
                  {gastosOrdenados.length} resultado{gastosOrdenados.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            {gastosOrdenados.length === 0 ? (
              <p className="gastos-empty-msg">No hay gastos que coincidan con la búsqueda.</p>
            ) : (
            <>
            <div className="table-wrap gastos-table-wrap">
              <table className="gastos-table">
                <thead>
                  <tr>
                    <th className="gastos-col-nombre">Nombre</th>
                    <th className="gastos-col-fecha">Fecha</th>
                    <th className="gastos-col-tipo">Tipo</th>
                    <th className="gastos-col-monto">Monto</th>
                    <th className="gastos-col-evidencia">Evidencia</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {gastosOrdenados.map((g) => (
                  <tr key={g.id}>
                    <td className="gastos-col-nombre" title={g.creadoPorNombre ?? undefined}>{g.creadoPorNombre ?? "—"}</td>
                    <td className="gastos-col-fecha">{g.fecha ? new Date(g.fecha).toLocaleDateString("es-CO") : "—"}</td>
                    <td className="gastos-col-tipo">{tipoLabel(g.tipo ?? "")}</td>
                    <td className="gastos-col-monto">{formatMoneda(g.monto ?? 0)}</td>
                    <td className="gastos-col-evidencia">
                      {g.evidencia ? (
                        <a href={g.evidencia} target="_blank" rel="noopener noreferrer" aria-label="Ver comprobante del gasto">
                          Ver comprobante
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {g.descripcion ? (
                        <button
                          type="button"
                          className="gastos-ver-motivo-btn"
                          onClick={() => setMotivoOverlay(g.descripcion)}
                          aria-label="Ver motivo completo del gasto"
                        >
                          Ver motivo
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
            )}
          </>
        )}
      </div>
      )}

      {motivoOverlay !== null && (
        <div className="gastos-motivo-overlay" role="dialog" aria-modal="true" aria-label="Motivo del gasto">
          <div className="gastos-motivo-overlay-backdrop" onClick={() => setMotivoOverlay(null)} aria-hidden />
          <div className="gastos-motivo-overlay-box">
            <span className="gastos-motivo-overlay-label">Motivo</span>
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
