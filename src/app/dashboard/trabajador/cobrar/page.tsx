"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  listClientes,
  listPrestamos,
  registrarPago,
  registrarNoPago,
  type ClienteItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import { uploadImage, getImageAccept } from "@/lib/storage";
import type { MotivoNoPago } from "@/types/finanzas";

function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
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

function formatCurrency(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

const MOTIVOS_NO_PAGO: { value: MotivoNoPago; label: string }[] = [
  { value: "sin_fondos", label: "No tenía dinero" },
  { value: "no_estaba", label: "No estaba en casa" },
  { value: "promesa_pago", label: "Prometió pagar después" },
  { value: "otro", label: "Otro motivo" },
];

export default function CobrarClientePage() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const clienteId = searchParams.get("clienteId");
  const prestamoId = searchParams.get("prestamoId");

  const [cliente, setCliente] = useState<ClienteItem | null>(null);
  const [prestamo, setPrestamo] = useState<PrestamoItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [montoInput, setMontoInput] = useState("");
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">("efectivo");
  const [evidenciaFiles, setEvidenciaFiles] = useState<(File | null)[]>([null, null]);
  const [evidenciaPreviews, setEvidenciaPreviews] = useState<(string | null)[]>([null, null]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSlot, setCameraSlot] = useState<0 | 1>(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef0 = useRef<HTMLInputElement>(null);
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  const [showNoPago, setShowNoPago] = useState(false);
  const [motivoNoPago, setMotivoNoPago] = useState<MotivoNoPago | "">("");
  const [notaNoPago, setNotaNoPago] = useState("");
  const [submittingNoPago, setSubmittingNoPago] = useState(false);
  const [noPagoRegistrado, setNoPagoRegistrado] = useState(false);

  useEffect(() => {
    if (!user || !clienteId || !prestamoId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    user.getIdToken().then((token) => {
      Promise.all([listClientes(token), listPrestamos(token)])
        .then(([clientes, prestamos]) => {
          if (cancelled) return;
          const c = clientes.find((x) => x.id === clienteId) ?? null;
          const p = prestamos.find((x) => x.id === prestamoId && x.clienteId === clienteId) ?? null;
          setCliente(c);
          setPrestamo(p);
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Error al cargar"))
        .finally(() => !cancelled && setLoading(false));
    });
    return () => { cancelled = true; };
  }, [user, clienteId, prestamoId]);

  useEffect(() => {
    if (!showCamera) return;
    setCameraError(null);
    const video = videoRef.current;
    if (!video) return;
    const constraints: MediaStreamConstraints = { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      streamRef.current = stream;
      video.srcObject = stream;
    }).catch((err) => setCameraError(err?.message ?? "No se pudo acceder a la cámara"));
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [showCamera]);

  const montoNum = useMemo(() => {
    const n = parseFloat(montoInput.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [montoInput]);

  const saldoPendiente = prestamo?.saldoPendiente ?? 0;
  const montoAplicar = Math.min(montoNum, saldoPendiente);
  const excedente = montoNum - montoAplicar;

  const capitalPrestado = prestamo?.monto ?? 0;
  const totalAPagar = prestamo?.totalAPagar ?? 0;
  const numeroCuotas = prestamo?.numeroCuotas ?? 0;
  const proporcionGanancia = totalAPagar > 0 ? (totalAPagar - capitalPrestado) / totalAPagar : 0;
  const capitalEnSaldo = saldoPendiente * (1 - proporcionGanancia);
  const cuotasPendientes =
    totalAPagar > 0 && numeroCuotas > 0
      ? Math.min(numeroCuotas, Math.ceil((saldoPendiente / totalAPagar) * numeroCuotas))
      : numeroCuotas;

  const fotosRequeridas = metodoPago === "transferencia" ? 2 : 1;
  const fotosActuales = evidenciaFiles.slice(0, fotosRequeridas).filter(Boolean).length;
  const evidenciaCompleta = fotosActuales === fotosRequeridas;
  const puedeConfirmar = montoNum > 0 && metodoPago && evidenciaCompleta;

  const setEvidenciaAt = (index: 0 | 1, file: File | null) => {
    setEvidenciaFiles((prev) => {
      const next = [...prev];
      next[index] = file;
      if (metodoPago === "efectivo" && index === 1) return next;
      return next;
    });
    setEvidenciaPreviews((prev) => {
      const next = [...prev];
      if (prev[index]) URL.revokeObjectURL(prev[index]!);
      next[index] = file ? URL.createObjectURL(file) : null;
      return next;
    });
  };

  useEffect(() => {
    if (metodoPago === "efectivo") {
      setEvidenciaFiles((prev) => [prev[0], null]);
      setEvidenciaPreviews((prev) => {
        if (prev[1]) URL.revokeObjectURL(prev[1]);
        return [prev[0], null];
      });
    }
  }, [metodoPago]);

  const handleConfirmarCobro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !prestamo || !puedeConfirmar) return;
    setError(null);
    setSubmitting(true);
    try {
      const filesToUpload = evidenciaFiles.slice(0, fotosRequeridas).filter((f): f is File => f != null);
      const urls: string[] = [];
      for (let i = 0; i < filesToUpload.length; i++) {
        const url = await uploadImage(filesToUpload[i], {
          folder: "pagos",
          ownerId: user.uid,
          filename: `evidencia-${i + 1}`,
        });
        urls.push(url);
      }
      const evidenciaUrl = urls.join(",");
      const token = await user.getIdToken();
      await registrarPago(token, prestamo.id, {
        monto: montoAplicar,
        metodoPago,
        evidencia: evidenciaUrl || undefined,
      });
      setConfirmado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar cobro");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegistrarNoPago = async () => {
    if (!motivoNoPago || !user || !prestamoId) return;
    setSubmittingNoPago(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      await registrarNoPago(token, prestamoId, {
        motivoNoPago,
        nota: notaNoPago.trim() || undefined,
      });
      setNoPagoRegistrado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar no pago");
    } finally {
      setSubmittingNoPago(false);
    }
  };

  if (!profile || profile.role !== "trabajador") return null;
  if (!clienteId || !prestamoId) {
    return (
      <div className="card">
        <p>Faltan cliente o préstamo. <Link href="/dashboard/trabajador/ruta">Volver a Ruta del día</Link></p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card">
        <p>Cargando...</p>
      </div>
    );
  }

  if (!cliente || !prestamo) {
    return (
      <div className="card">
        <p>Cliente o préstamo no encontrado. <Link href="/dashboard/trabajador/ruta">Volver a Ruta del día</Link></p>
      </div>
    );
  }

  if (confirmado) {
    return (
      <div className="card cobrar-card cobrar-confirmacion">
        <h2 className="cobrar-title">Cobro registrado</h2>
        <p>Se registró el pago de {formatCurrency(montoAplicar)} para {cliente.nombre}.</p>
        <Link href="/dashboard/trabajador/ruta" className="btn btn-primary">Volver a Ruta del día</Link>
      </div>
    );
  }

  if (noPagoRegistrado) {
    return (
      <div className="card cobrar-card cobrar-confirmacion">
        <h2 className="cobrar-title">No pago registrado</h2>
        <p>Se anotó que {cliente.nombre} no realizó el pago ({MOTIVOS_NO_PAGO.find((m) => m.value === motivoNoPago)?.label ?? motivoNoPago}).</p>
        <Link href="/dashboard/trabajador/ruta" className="btn btn-primary">Volver a Ruta del día</Link>
      </div>
    );
  }

  if (showNoPago) {
    return (
      <div className="card cobrar-card">
        <div className="cobrar-header">
          <Link href={`/dashboard/trabajador/cobrar?clienteId=${clienteId}&prestamoId=${prestamoId}`} className="cobrar-back">← Volver</Link>
          <h2 className="cobrar-title">No pagó</h2>
          <p className="cobrar-subtitle">{cliente.nombre}</p>
        </div>
        <p className="cobrar-text">Indica el motivo para registrar la visita sin cobro.</p>
        <div className="form-group">
          <label>Motivo</label>
          <select
            value={motivoNoPago}
            onChange={(e) => setMotivoNoPago(e.target.value as MotivoNoPago)}
            className="cobrar-select"
          >
            <option value="">Seleccionar...</option>
            {MOTIVOS_NO_PAGO.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Nota (opcional)</label>
          <input
            type="text"
            value={notaNoPago}
            onChange={(e) => setNotaNoPago(e.target.value)}
            placeholder="Detalle adicional"
            className="cobrar-input"
          />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div className="cobrar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowNoPago(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!motivoNoPago || submittingNoPago}
            onClick={handleRegistrarNoPago}
          >
            {submittingNoPago ? "Registrando..." : "Confirmar no pago"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card cobrar-card">
      <div className="cobrar-header">
        <Link href="/dashboard/trabajador/ruta" className="cobrar-back">← Ruta del día</Link>
        <h2 className="cobrar-title">{cliente.nombre}</h2>
        <p className="cobrar-subtitle">
          Saldo pendiente · {prestamo.modalidad} · Estado: {prestamo.estado}
        </p>
      </div>

      <div className="cobrar-metricas">
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Capital pendiente</span>
          <span className="cobrar-metrica-value">{formatCurrency(capitalEnSaldo)}</span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Número de cuotas pendientes</span>
          <span className="cobrar-metrica-value">{cuotasPendientes}</span>
        </div>
        <div className="cobrar-metrica cobrar-metrica-total">
          <span className="cobrar-metrica-label">Total a cobrar</span>
          <span className="cobrar-metrica-value">{formatCurrency(saldoPendiente)}</span>
        </div>
      </div>

      <form onSubmit={handleConfirmarCobro} className="cobrar-form">
        <div className="form-group">
          <label>Monto recibido</label>
          <input
            type="text"
            inputMode="decimal"
            value={montoInput}
            onChange={(e) => setMontoInput(e.target.value)}
            placeholder="0"
            className="cobrar-input cobrar-input-monto"
          />
        </div>

        {montoNum > 0 && (
          <div className="cobrar-distribucion">
            <p className="cobrar-distribucion-title">Distribución del pago</p>
            <p>Se abonará <strong>{formatCurrency(montoAplicar)}</strong> al saldo pendiente.</p>
            {excedente > 0 && (
              <p className="cobrar-excedente">Excedente: {formatCurrency(excedente)} (no se aplica a este préstamo).</p>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Método de pago</label>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value as "efectivo" | "transferencia")}
            className="cobrar-select"
          >
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>

        <div className="form-group">
          <label>
            Evidencia del pago <span className="form-required" aria-hidden>*</span>
          </label>
          <p className="cobrar-evidencia-hint">
            {metodoPago === "efectivo"
              ? "Efectivo: 1 foto obligatoria (subir o tomar con cámara)."
              : "Transferencia: 2 fotos obligatorias (subir o tomar con cámara)."}
          </p>
          <p className="cobrar-evidencia-progress">
            {fotosActuales} de {fotosRequeridas} foto{fotosRequeridas === 2 ? "s" : ""}
          </p>
          <div className="cobrar-evidencia-slots">
            {([0, 1] as const).slice(0, fotosRequeridas).map((index) => (
              <div key={index} className="cobrar-evidencia-slot">
                <span className="cobrar-evidencia-slot-label">Foto {index + 1}</span>
                {evidenciaPreviews[index] ? (
                  <div className="cobrar-evidencia-preview">
                    <img src={evidenciaPreviews[index]!} alt={`Evidencia ${index + 1}`} />
                    <button
                      type="button"
                      className="cobrar-evidencia-remove"
                      onClick={() => setEvidenciaAt(index, null)}
                      aria-label="Quitar foto"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ) : (
                  <div className="cobrar-evidencia-buttons">
                    <input
                      ref={index === 0 ? fileInputRef0 : fileInputRef1}
                      type="file"
                      accept={getImageAccept()}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setEvidenciaAt(index, file);
                        e.target.value = "";
                      }}
                      className="cobrar-file-hidden"
                      aria-label={`Subir foto ${index + 1}`}
                    />
                    <button
                      type="button"
                      className="cobrar-evidencia-btn"
                      onClick={() => (index === 0 ? fileInputRef0 : fileInputRef1).current?.click()}
                      aria-label={`Subir imagen ${index + 1}`}
                    >
                      <UploadIcon />
                      <span>Subir imagen</span>
                    </button>
                    <button
                      type="button"
                      className="cobrar-evidencia-btn"
                      onClick={() => {
                        setCameraSlot(index);
                        setCameraError(null);
                        setShowCamera(true);
                      }}
                      aria-label={`Tomar foto ${index + 1}`}
                    >
                      <CameraIcon />
                      <span>Tomar foto</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {showCamera && (
          <div className="cobrar-camera-overlay" role="dialog" aria-modal="true" aria-label="Tomar foto">
            <div className="cobrar-camera-backdrop" onClick={() => setShowCamera(false)} aria-hidden />
            <div className="cobrar-camera-box">
              <div className="cobrar-camera-header">
                <h4 className="cobrar-camera-title">Tomar foto {cameraSlot + 1}</h4>
                <button type="button" className="cobrar-camera-close" onClick={() => setShowCamera(false)} aria-label="Cerrar">
                  <CloseIcon />
                </button>
              </div>
              {cameraError ? (
                <p className="cobrar-camera-error">{cameraError}</p>
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="cobrar-camera-video" />
              )}
              <div className="cobrar-camera-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCamera(false)}>Cancelar</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!cameraError}
                  onClick={() => {
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
                      const file = new File([blob], `evidencia-${cameraSlot + 1}.png`, { type: "image/png" });
                      setEvidenciaAt(cameraSlot, file);
                      streamRef.current?.getTracks().forEach((t) => t.stop());
                      streamRef.current = null;
                      if (video) video.srcObject = null;
                      setShowCamera(false);
                    }, "image/png", 0.92);
                  }}
                >
                  Capturar
                </button>
              </div>
            </div>
          </div>
        )}


        {error && <p className="error-msg">{error}</p>}

        <div className="cobrar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowNoPago(true)}
          >
            No pagó
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!puedeConfirmar || submitting}
            title={!evidenciaCompleta ? `Falta evidencia: ${fotosRequeridas - fotosActuales} foto(s) requerida(s)` : undefined}
          >
            {submitting ? "Registrando..." : "Confirmar cobro"}
          </button>
        </div>
      </form>
    </div>
  );
}
