"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  listClientes,
  listPrestamos,
  listPagos,
  registrarPago,
  registrarNoPago,
  actualizarComprobantePago,
  type ClienteItem,
  type PrestamoItem,
  type PagoItem,
} from "@/lib/empresa-api";
import { uploadImage, getImageAccept } from "@/lib/storage";
import html2canvas from "html2canvas";
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

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

/** Obtiene la imagen como Blob; si fetch falla por CORS, usa canvas desde img con crossOrigin. */
async function getImageBlob(url: string): Promise<Blob> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("No se pudo cargar la imagen");
    return await res.blob();
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no disponible"));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png", 0.95);
      };
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = url;
    });
  }
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
  const pathname = usePathname();
  const clienteId = searchParams.get("clienteId");
  const prestamoId = searchParams.get("prestamoId");
  const fromAdmin = searchParams.get("from") === "admin" || (pathname ?? "").includes("/admin/");

  const [cliente, setCliente] = useState<ClienteItem | null>(null);
  const [prestamo, setPrestamo] = useState<PrestamoItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimosPagos, setUltimosPagos] = useState<PagoItem[]>([]);
  const [historialExpandido, setHistorialExpandido] = useState(false);
  const [nuevoSaldoPendiente, setNuevoSaldoPendiente] = useState<number | null>(null);

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
  const [pagoIdConfirmado, setPagoIdConfirmado] = useState<string | null>(null);
  const comprobanteRef = useRef<HTMLDivElement>(null);
  const comprobanteBlobRef = useRef<Blob | null>(null);
  const [comprobanteImageUrl, setComprobanteImageUrl] = useState<string | null>(null);
  const [comprobanteGenerando, setComprobanteGenerando] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);

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
    if (!user || !prestamoId) return;
    let cancelled = false;
    user.getIdToken().then((token) => {
      listPagos(token, prestamoId)
        .then((pagos) => { if (!cancelled) setUltimosPagos(pagos); })
        .catch(() => { if (!cancelled) setUltimosPagos([]); });
    });
    return () => { cancelled = true; };
  }, [user, prestamoId]);

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

  const totalAPagar = prestamo?.totalAPagar ?? 0;
  const numeroCuotas = prestamo?.numeroCuotas ?? 0;
  const cuotasPendientes =
    totalAPagar > 0 && numeroCuotas > 0
      ? Math.min(numeroCuotas, Math.ceil((saldoPendiente / totalAPagar) * numeroCuotas))
      : numeroCuotas;
  const valorCuotaFija = numeroCuotas > 0 ? totalAPagar / numeroCuotas : 0;
  const adelantoCuota = prestamo?.adelantoCuota ?? 0;
  const restoAdelantoEnCuota = valorCuotaFija > 0 ? adelantoCuota - Math.floor(adelantoCuota / valorCuotaFija) * valorCuotaFija : 0;
  let sugerenciaBruta = valorCuotaFija > 0 ? Math.round((valorCuotaFija - restoAdelantoEnCuota) * 100) / 100 : 0;
  if (sugerenciaBruta <= 0 && valorCuotaFija > 0) sugerenciaBruta = valorCuotaFija;
  const valorCuotaSugerido = Math.min(sugerenciaBruta, saldoPendiente);

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

  useEffect(() => {
    if (!showShareMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showShareMenu]);

  useEffect(() => {
    if (!confirmado || !pagoIdConfirmado || !prestamo || !user || comprobanteImageUrl) return;
    const el = comprobanteRef.current;
    if (!el) return;
    let cancelled = false;
    setComprobanteGenerando(true);
    const t = setTimeout(async () => {
      try {
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          logging: false,
        });
        if (cancelled) return;
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), "image/png", 0.95)
        );
        if (!blob || cancelled) return;
        comprobanteBlobRef.current = blob;
        const file = new File([blob], "comprobante-pago.png", { type: "image/png" });
        const token = await user.getIdToken();
        const url = await uploadImage(file, {
          folder: "comprobantes",
          ownerId: prestamo.id,
          filename: pagoIdConfirmado,
        });
        if (cancelled) return;
        await actualizarComprobantePago(token, prestamo.id, pagoIdConfirmado, url);
        if (!cancelled) setComprobanteImageUrl(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al generar comprobante");
      } finally {
        if (!cancelled) setComprobanteGenerando(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setComprobanteGenerando(false);
    };
  }, [confirmado, pagoIdConfirmado, prestamo?.id, user, comprobanteImageUrl]);

  const handleConfirmarCobro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !prestamo || !puedeConfirmar || !profile) return;
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
      const nombreRegistro = profile.displayName ?? profile.email ?? "";
      const res = await registrarPago(token, prestamo.id, {
        monto: montoAplicar,
        metodoPago,
        evidencia: evidenciaUrl || undefined,
        registradoPorUid: user.uid,
        registradoPorNombre: nombreRegistro || undefined,
      });
      setNuevoSaldoPendiente(res.saldoPendiente);
      setPagoIdConfirmado(res.pagoId ?? null);
      setConfirmado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar cobro");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegistrarNoPago = async () => {
    if (!motivoNoPago || !user || !prestamoId || !profile) return;
    setSubmittingNoPago(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const nombreRegistro = profile.displayName ?? profile.email ?? "";
      await registrarNoPago(token, prestamoId, {
        motivoNoPago,
        nota: notaNoPago.trim() || undefined,
        registradoPorUid: user.uid,
        registradoPorNombre: nombreRegistro || undefined,
      });
      setNoPagoRegistrado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar no pago");
    } finally {
      setSubmittingNoPago(false);
    }
  };

  if (!profile || (profile.role !== "trabajador" && profile.role !== "admin")) return null;
  const backHref = fromAdmin ? "/dashboard/admin/prestamo" : "/dashboard/trabajador/ruta";
  const backLabel = fromAdmin ? "Volver a Préstamos" : "Ruta del día";
  if (!clienteId || !prestamoId) {
    return (
      <div className="card">
        <p>Faltan cliente o préstamo. <Link href={backHref}>{backLabel}</Link></p>
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
        <p>Cliente o préstamo no encontrado. <Link href={backHref}>{backLabel}</Link></p>
      </div>
    );
  }

  const saldoTrasCobro = nuevoSaldoPendiente ?? 0;
  const cuotasRestantesTrasCobro =
    totalAPagar > 0 && numeroCuotas > 0
      ? Math.min(numeroCuotas, Math.ceil((saldoTrasCobro / totalAPagar) * numeroCuotas))
      : 0;
  const cuotasPagadasTrasCobro = numeroCuotas - cuotasRestantesTrasCobro;

  if (confirmado) {
    return (
      <div className="card cobrar-card cobrar-confirmacion">
        <h2 className="cobrar-title">Cobro registrado</h2>
        <p>Se registró el pago de {formatCurrency(montoAplicar)} para {cliente.nombre}.</p>
        <div className="cobrar-resumen-post" aria-label="Resumen tras el cobro">
          <p><strong>Nuevo saldo pendiente:</strong> {formatCurrency(saldoTrasCobro)}</p>
          <p><strong>Cuotas restantes:</strong> {cuotasRestantesTrasCobro} de {numeroCuotas}</p>
        </div>
        {comprobanteImageUrl ? (
          <div className="comprobante-cobro comprobante-imagen-wrap">
            <img src={comprobanteImageUrl} alt="Comprobante de pago" className="comprobante-imagen" />
          </div>
        ) : (
          <>
            {comprobanteGenerando && (
              <p className="comprobante-generando-msg">Generando comprobante en imagen…</p>
            )}
            <div ref={comprobanteRef} className="comprobante-cobro comprobante-voucher" aria-label="Comprobante para el cliente">
              <div className="voucher-header">
                <div className="voucher-icon" aria-hidden>✓</div>
                <h3 className="voucher-title">Pago exitoso</h3>
                <p className="voucher-subtitle">Comprobante de pago</p>
              </div>
              <div className="voucher-monto">
                <span className="voucher-monto-label">Monto pagado</span>
                <span className="voucher-monto-value">{formatCurrency(montoAplicar)}</span>
              </div>
              <div className="voucher-rows">
                <div className="voucher-row">
                  <span className="voucher-row-label">Cliente</span>
                  <span className="voucher-row-value">{cliente.nombre}</span>
                </div>
                {cliente.cedula && (
                  <div className="voucher-row">
                    <span className="voucher-row-label">Cédula</span>
                    <span className="voucher-row-value">{cliente.cedula}</span>
                  </div>
                )}
                {cliente.telefono && (
                  <div className="voucher-row">
                    <span className="voucher-row-label">Teléfono</span>
                    <span className="voucher-row-value">{cliente.telefono}</span>
                  </div>
                )}
                <div className="voucher-row">
                  <span className="voucher-row-label">Cuota</span>
                  <span className="voucher-row-value">Cuota {cuotasPagadasTrasCobro} de {numeroCuotas}</span>
                </div>
                <div className="voucher-row">
                  <span className="voucher-row-label">Saldo restante</span>
                  <span className="voucher-row-value">{formatCurrency(saldoTrasCobro)}</span>
                </div>
              </div>
              <div className="voucher-footer">
                <p className="voucher-fecha">{new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}</p>
                <p className="voucher-brand">KrediApp · Comprobante válido</p>
              </div>
            </div>
          </>
        )}
        {error && <p className="error-msg" role="alert">{error}</p>}
        <div className="cobrar-confirmacion-actions">
          <div className="compartir-wrap" ref={shareMenuRef}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={(e) => { e.stopPropagation(); setShowShareMenu((v) => !v); setError(null); }}
              aria-expanded={showShareMenu}
              aria-haspopup="true"
            >
              Compartir
            </button>
            {showShareMenu && (
              <div className="compartir-dropdown compartir-dropdown-iconos" role="menu">
                <button
                  type="button"
                  className="compartir-opcion compartir-opcion-icono"
                  role="menuitem"
                  disabled={!comprobanteImageUrl}
                  onClick={async () => {
                    if (!comprobanteImageUrl) return;
                    setShowShareMenu(false);
                    setError(null);
                    try {
                      const blob = comprobanteBlobRef.current ?? await getImageBlob(comprobanteImageUrl);
                      const file = new File([blob], "comprobante-pago.png", { type: blob.type || "image/png" });
                      const hasShareApi = typeof navigator !== "undefined" && "share" in navigator;
                      const canShare = hasShareApi && (typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : true);
                      if (canShare) {
                        await navigator.share({ files: [file], title: "Comprobante de pago" });
                      } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "comprobante-pago.png";
                        a.click();
                        URL.revokeObjectURL(url);
                        window.open("https://wa.me/?text=" + encodeURIComponent(comprobanteImageUrl), "_blank", "noopener");
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error al compartir la imagen");
                    }
                  }}
                >
                  <span className="compartir-icono compartir-icono-wa" aria-hidden><WhatsAppIcon /></span>
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  className="compartir-opcion compartir-opcion-icono"
                  role="menuitem"
                  disabled={!comprobanteImageUrl}
                  onClick={async () => {
                    if (!comprobanteImageUrl) return;
                    setShowShareMenu(false);
                    setError(null);
                    try {
                      const blob = comprobanteBlobRef.current ?? await getImageBlob(comprobanteImageUrl);
                      const file = new File([blob], "comprobante-pago.png", { type: blob.type || "image/png" });
                      const hasShareApi = typeof navigator !== "undefined" && "share" in navigator;
                      const canShare = hasShareApi && (typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : true);
                      if (canShare) {
                        await navigator.share({ files: [file], title: "Comprobante de pago" });
                      } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "comprobante-pago.png";
                        a.click();
                        URL.revokeObjectURL(url);
                        const mailUrl = "https://mail.google.com/mail/?view=cm&fs=1&body=" + encodeURIComponent(comprobanteImageUrl);
                        window.open(mailUrl, "_blank", "noopener");
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error al compartir la imagen");
                    }
                  }}
                >
                  <span className="compartir-icono compartir-icono-mail" aria-hidden><GmailIcon /></span>
                  <span>Gmail</span>
                </button>
              </div>
            )}
          </div>
          <Link href={backHref} className="btn btn-secondary">{backLabel}</Link>
        </div>
      </div>
    );
  }

  if (noPagoRegistrado) {
    return (
      <div className="card cobrar-card cobrar-confirmacion">
        <h2 className="cobrar-title">No pago registrado</h2>
        <p>Se anotó que {cliente.nombre} no realizó el pago ({MOTIVOS_NO_PAGO.find((m) => m.value === motivoNoPago)?.label ?? motivoNoPago}).</p>
        <Link href={backHref} className="btn btn-primary">{backLabel}</Link>
      </div>
    );
  }

  if (showNoPago) {
    const cobrarQuery = `clienteId=${clienteId}&prestamoId=${prestamoId}${fromAdmin ? "&from=admin" : ""}`;
    return (
      <div className="card cobrar-card">
        <div className="cobrar-header">
          <Link href={fromAdmin ? `/dashboard/admin/cobrar?${cobrarQuery}` : `/dashboard/trabajador/cobrar?${cobrarQuery}`} className="cobrar-back">← Volver</Link>
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

  const pagosSoloPago = ultimosPagos.filter((p) => p.tipo === "pago");
  const formatFechaPago = (f: string | null) =>
    f ? new Date(f).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="card cobrar-card">
      <div className="cobrar-header">
        <Link href={backHref} className="cobrar-back">← {backLabel}</Link>
        <h2 className="cobrar-title">{cliente.nombre}</h2>
        <p className="cobrar-subtitle">
          Saldo pendiente · {prestamo.modalidad} · Estado: {prestamo.estado}
        </p>
      </div>

      <div className="cobrar-historial-wrap">
        <button
          type="button"
          className="cobrar-historial-toggle"
          onClick={() => setHistorialExpandido((v) => !v)}
          aria-expanded={historialExpandido}
          aria-controls="cobrar-historial-list"
          id="cobrar-historial-btn"
        >
          <span className="cobrar-historial-toggle-label">Últimos pagos</span>
          <span className="cobrar-historial-toggle-badge" aria-hidden>
            {pagosSoloPago.length} registro{pagosSoloPago.length !== 1 ? "s" : ""}
          </span>
          <span className="cobrar-historial-toggle-icon" aria-hidden>{historialExpandido ? "▲" : "▼"}</span>
        </button>
        <div
          id="cobrar-historial-list"
          role="region"
          aria-labelledby="cobrar-historial-btn"
          className="cobrar-historial-list"
          style={{ display: historialExpandido ? "block" : "none" }}
        >
          {pagosSoloPago.length === 0 ? (
            <p className="cobrar-historial-empty">Aún no hay pagos registrados en este préstamo.</p>
          ) : (
            <ul className="cobrar-historial-ul">
              {pagosSoloPago.map((p) => (
                <li key={p.id} className="cobrar-historial-li">
                  <span className="cobrar-historial-fecha">{formatFechaPago(p.fecha)}</span>
                  <span className="cobrar-historial-monto">{formatCurrency(p.monto)}</span>
                  <span className="cobrar-historial-metodo">{p.metodoPago === "transferencia" ? "Transferencia" : "Efectivo"}</span>
                  <span className="cobrar-historial-registrado" title="Registrado por">
                    {p.registradoPorNombre || p.registradoPorUid || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="cobrar-metricas">
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Saldo pendiente</span>
          <span className="cobrar-metrica-value">{formatCurrency(saldoPendiente)}</span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Número de cuotas</span>
          <span className="cobrar-metrica-value">{numeroCuotas}</span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Cuotas pendientes</span>
          <span className="cobrar-metrica-value">{cuotasPendientes}</span>
        </div>
        <div className="cobrar-metrica cobrar-metrica-sugerencia">
          <span className="cobrar-metrica-label">Valor de la cuota (sugerencia de pago)</span>
          <span className="cobrar-metrica-value">{formatCurrency(valorCuotaSugerido)}</span>
          {adelantoCuota > 0 && (
            <span className="cobrar-metrica-hint">Cuota fija {formatCurrency(valorCuotaFija)} · Tiene {formatCurrency(adelantoCuota)} de adelanto; solo falta este monto para la próxima cuota.</span>
          )}
        </div>
      </div>

      <form onSubmit={handleConfirmarCobro} className="cobrar-form">
        <div className="form-group">
          <label>Monto a recibir</label>
          <div className="cobrar-monto-row">
            <input
              type="text"
              inputMode="decimal"
              value={montoInput}
              onChange={(e) => setMontoInput(e.target.value)}
              placeholder={valorCuotaSugerido > 0 ? formatCurrency(valorCuotaSugerido) : "0"}
              className="cobrar-input cobrar-input-monto"
            />
            {valorCuotaSugerido > 0 && (
              <button
                type="button"
                className="btn btn-secondary cobrar-usar-sugerencia"
                onClick={() => setMontoInput(Math.round(valorCuotaSugerido).toString())}
              >
                Usar sugerencia
              </button>
            )}
          </div>
        </div>

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
