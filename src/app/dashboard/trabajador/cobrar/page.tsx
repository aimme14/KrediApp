"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import {
  listPagos,
  registrarPago,
  registrarNoPago,
  registrarPerdida,
  checkCobroIdempotency,
  type ClienteItem,
  type PrestamoItem,
  type PagoItem,
} from "@/lib/empresa-api";
import { uploadImage, getImageAccept } from "@/lib/storage";
import { captureVideoFrameAsJpeg } from "@/lib/image-utils";
import { getEmpresa } from "@/lib/empresa";
import type { MotivoNoPago, MotivoPerdida } from "@/types/finanzas";
import {
  sanitizeMontoDecimalCOP,
  formatMontoDecimalCOPDisplay,
  interiorDecimalCOPToNumber,
} from "@/lib/monto-input-es";
import { ModalConfirmar } from "@/components/trabajador/ModalConfirmar";
import { labelEstadoPrestamo, normalizeEstadoPrestamo } from "@/lib/prestamo-estado";
import { round2 } from "@/lib/ruta-financiera-compute";

/** Escala de captura: mínimo 2× para nitidez en móviles; tope para no disparar memoria ni el límite de subida. */
function getComprobanteCaptureScale(): number {
  if (typeof window === "undefined") return 2;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(2.5, Math.max(2, dpr));
}

/** Carga html2canvas solo en el cliente (evita fallos de bundle/SSR y reduce el JS inicial). */
async function captureElementToCanvas(el: HTMLElement) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(el, {
    scale: getComprobanteCaptureScale(),
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
  });
}

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

/** Indicador de captura del comprobante (html2canvas). */
function ComprobanteLoadingIcon() {
  return (
    <svg className="comprobante-spinner-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
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

const MOTIVOS_PERDIDA: { value: MotivoPerdida; label: string }[] = [
  { value: "imposible_cobrar", label: "Imposible cobrar" },
  { value: "cliente_perdido", label: "Cliente perdido" },
  { value: "acuerdo_quita", label: "Acuerdo / quita" },
  { value: "otro", label: "Otro" },
];

type CobroSnapshot = {
  key: string;
  prestamoId: string;
  monto: number;
  metodoPago: "efectivo" | "transferencia";
  clienteId: string;
};

function getCobroSnapshot(pid: string, uid: string): CobroSnapshot | null {
  try {
    const raw = localStorage.getItem(`kredi:cobro:${pid}:${uid}`);
    return raw ? (JSON.parse(raw) as CobroSnapshot) : null;
  } catch {
    return null;
  }
}

function setCobroSnapshot(s: CobroSnapshot, uid: string): void {
  try {
    localStorage.setItem(`kredi:cobro:${s.prestamoId}:${uid}`, JSON.stringify(s));
  } catch {
    /* localStorage no disponible */
  }
}

function clearCobroSnapshot(pid: string, uid: string): void {
  try {
    localStorage.removeItem(`kredi:cobro:${pid}:${uid}`);
  } catch {
    /* localStorage no disponible */
  }
}

function CobrarClientePageContent() {
  const { user, profile } = useAuth();
  const {
    clientes: clientesLista,
    prestamos: prestamosLista,
    loading: listaLoading,
    error: listaError,
    refresh: refreshLista,
  } = useTrabajadorLista();
  const { refresh: refreshCajaDia } = useTrabajadorCajaDia();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
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
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSlot, setCameraSlot] = useState<0>(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef0 = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Texto auxiliar durante envío (subidas en paralelo + API). */
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [showModalCobro, setShowModalCobro] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const comprobanteRef = useRef<HTMLDivElement>(null);
  const comprobanteBlobRef = useRef<Blob | null>(null);
  const comprobanteObjectUrlRef = useRef<string | null>(null);
  /** Vista previa local (blob:) solo en esta pantalla; no se persiste en Storage ni en Firestore. */
  const [comprobanteDisplayUrl, setComprobanteDisplayUrl] = useState<string | null>(null);
  const [comprobanteGenerando, setComprobanteGenerando] = useState(false);
  const [comprobanteError, setComprobanteError] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  /** Snapshot al confirmar cobro (evita perder datos si Firestore quita el préstamo de la lista activa). */
  const cobroConfirmadoRef = useRef<{
    cliente: ClienteItem;
    prestamo: PrestamoItem;
    montoAplicar: number;
  } | null>(null);

  /** Nombre de la empresa en el pie del comprobante (evita mostrar la marca genérica). */
  const [empresaComprobanteMeta, setEmpresaComprobanteMeta] = useState<{
    nombre: string | null;
    listo: boolean;
  }>({ nombre: null, listo: false });

  const [showNoPago, setShowNoPago] = useState(false);
  const [motivoNoPago, setMotivoNoPago] = useState<MotivoNoPago | "">("");
  const [notaNoPago, setNotaNoPago] = useState("");
  const [submittingNoPago, setSubmittingNoPago] = useState(false);
  const [showModalNoPago, setShowModalNoPago] = useState(false);
  const [noPagoRegistrado, setNoPagoRegistrado] = useState(false);

  const [showPerdida, setShowPerdida] = useState(false);
  const [showModalPerdida, setShowModalPerdida] = useState(false);
  const [motivoPerdida, setMotivoPerdida] = useState<MotivoPerdida | "">("");
  const [notaPerdida, setNotaPerdida] = useState("");
  const [submittingPerdida, setSubmittingPerdida] = useState(false);
  const [showModalPerdidaExito, setShowModalPerdidaExito] = useState(false);
  const [saldoPerdidaRegistrada, setSaldoPerdidaRegistrada] = useState(0);

  useEffect(() => {
    if (!user || !clienteId || !prestamoId) {
      setLoading(false);
      return;
    }
    if (confirmado) {
      setLoading(false);
      return;
    }
    const esperandoPrimeraCarga =
      listaLoading &&
      clientesLista.length === 0 &&
      prestamosLista.length === 0;
    if (esperandoPrimeraCarga) {
      setLoading(true);
      return;
    }

    const c = clientesLista.find((x) => x.id === clienteId) ?? null;
    const p =
      prestamosLista.find((x) => x.id === prestamoId && x.clienteId === clienteId) ??
      null;
    setCliente(c);
    setPrestamo(p);

    if (listaError) setError(listaError);
    else if (!c || !p)
      setError("");
    else setError(null);
    setLoading(false);
  }, [
    user,
    clienteId,
    prestamoId,
    clientesLista,
    prestamosLista,
    listaLoading,
    listaError,
    confirmado,
  ]);

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
    if (!profile?.empresaId) {
      setEmpresaComprobanteMeta({ nombre: null, listo: true });
      return;
    }
    let cancelled = false;
    setEmpresaComprobanteMeta({ nombre: null, listo: false });
    void getEmpresa(profile.empresaId)
      .then((e) => {
        if (!cancelled) {
          setEmpresaComprobanteMeta({
            nombre: e?.nombre?.trim() || null,
            listo: true,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmpresaComprobanteMeta({ nombre: null, listo: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.empresaId]);

  useEffect(() => {
    if (!user || !prestamoId || !clienteId || confirmado || loading) {
      if (!loading) setRecoveryChecked(true);
      return;
    }
    if (!cliente || !prestamo) {
      if (!loading) setRecoveryChecked(true);
      return;
    }

    const snapshot = getCobroSnapshot(prestamoId, user.uid);
    if (!snapshot?.key || snapshot.prestamoId !== prestamoId) {
      if (snapshot) clearCobroSnapshot(prestamoId, user.uid);
      setRecoveryChecked(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const result = await checkCobroIdempotency(token, prestamoId, snapshot.key);
        if (cancelled) return;

        if (result.processed && result.payload) {
          clearCobroSnapshot(prestamoId, user.uid);
          const montoRecuperado = result.payload.montoAplicado ?? snapshot.monto;
          cobroConfirmadoRef.current = {
            cliente,
            prestamo,
            montoAplicar: montoRecuperado,
          };
          setNuevoSaldoPendiente(result.payload.saldoPendiente);
          setPrestamo((p) =>
            p
              ? {
                  ...p,
                  saldoPendiente: result.payload!.saldoPendiente,
                  estado: normalizeEstadoPrestamo(result.payload!.estado),
                }
              : p
          );
          setConfirmado(true);
          void refreshLista();
          void refreshCajaDia();
        } else if (result.failed) {
          clearCobroSnapshot(prestamoId, user.uid);
          setError(result.error ?? "El cobro anterior falló. Intenta de nuevo.");
        } else if (result.processing) {
          setError("");
        }
      } catch {
        /* Error de red — mantener snapshot para reintento */
      } finally {
        if (!cancelled) setRecoveryChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    prestamoId,
    clienteId,
    confirmado,
    loading,
    cliente,
    prestamo,
    refreshLista,
    refreshCajaDia,
  ]);

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
    const n = interiorDecimalCOPToNumber(montoInput);
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

  const desglosePerdida = useMemo(() => {
    if (!prestamo) return null;
    const capitalPrestado = prestamo.monto ?? 0;
    const total = prestamo.totalAPagar ?? 0;
    const saldo = prestamo.saldoPendiente ?? 0;
    if (saldo <= 0 || total <= 0) return null;

    const cobradoAcumulado = round2(total - saldo);
    const capitalNoRecuperado =
      cobradoAcumulado < capitalPrestado
        ? round2(capitalPrestado - cobradoAcumulado)
        : 0;

    return {
      saldoPendiente: saldo,
      capitalNoRecuperado,
      interesNoCobradoEnSaldo: round2(saldo - capitalNoRecuperado),
      capitalRecuperado: cobradoAcumulado >= capitalPrestado,
    };
  }, [prestamo]);

  const evidenciaRequerida = metodoPago === "transferencia";
  const puedeConfirmar = montoNum > 0 && metodoPago;
  const clienteCobro =
    cliente ?? clientesLista.find((x) => x.id === clienteId) ?? null;

  const setEvidencia = (file: File | null) => {
    setEvidenciaFile(file);
    setEvidenciaPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  useEffect(() => {
    // Si cambia el método a efectivo, se limpia la evidencia para evitar subir fotos innecesarias.
    if (metodoPago === "efectivo" && evidenciaFile) {
      setEvidencia(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return () => {
      if (comprobanteObjectUrlRef.current) {
        URL.revokeObjectURL(comprobanteObjectUrlRef.current);
        comprobanteObjectUrlRef.current = null;
      }
    };
  }, []);

  const generarComprobanteLocal = useCallback(async () => {
    const el = comprobanteRef.current;
    if (!el) throw new Error("No se encontró el comprobante en pantalla");
    setComprobanteError(null);
    setComprobanteGenerando(true);
    try {
      const canvas = await captureElementToCanvas(el);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/png", 0.95)
      );
      if (!blob) throw new Error("No se pudo generar la imagen");
      comprobanteBlobRef.current = blob;
      if (comprobanteObjectUrlRef.current) {
        URL.revokeObjectURL(comprobanteObjectUrlRef.current);
        comprobanteObjectUrlRef.current = null;
      }
      const objUrl = URL.createObjectURL(blob);
      comprobanteObjectUrlRef.current = objUrl;
      setComprobanteDisplayUrl(objUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar comprobante";
      setComprobanteError(msg);
      throw e;
    } finally {
      setComprobanteGenerando(false);
    }
  }, []);

  const reintentarComprobante = useCallback(async () => {
    try {
      await generarComprobanteLocal();
    } catch {
      /* generarComprobanteLocal ya registró el error */
    }
  }, [generarComprobanteLocal]);

  useEffect(() => {
    if (!confirmado || comprobanteDisplayUrl || !empresaComprobanteMeta.listo) return;
    const prestamoParaComprobante =
      prestamo ?? cobroConfirmadoRef.current?.prestamo ?? null;
    if (!prestamoParaComprobante) return;
    const el = comprobanteRef.current;
    if (!el) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          await generarComprobanteLocal();
          if (cancelled) return;
        } catch {
          /* error de generación */
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    confirmado,
    prestamo?.id,
    comprobanteDisplayUrl,
    generarComprobanteLocal,
    empresaComprobanteMeta.listo,
  ]);

  const descargarComprobanteDesdeDOM = useCallback(async () => {
    const blobCached = comprobanteBlobRef.current;
    if (blobCached) {
      const url = URL.createObjectURL(blobCached);
      const a = document.createElement("a");
      a.href = url;
      a.download = "comprobante-pago.png";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const el = comprobanteRef.current;
    if (!el) return;
    try {
      const canvas = await captureElementToCanvas(el);
      canvas.toBlob((blob) => {
        if (!blob) return;
        comprobanteBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "comprobante-pago.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png", 0.95);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar descarga");
    }
  }, []);

  const handleRevisarCobro = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !prestamo || !puedeConfirmar || !profile) return;
    if (!clienteCobro) {
      setError("Cliente no encontrado");
      return;
    }
    if (evidenciaRequerida && !evidenciaFile) {
      setError("Transferencia: debes adjuntar 1 foto de evidencia.");
      return;
    }
    setError(null);
    setShowModalCobro(true);
  };

  const handleEjecutarCobro = async () => {
    if (!user || !prestamo || !puedeConfirmar || !profile || !prestamoId) return;
    const prestamoAlCobrar = prestamo;
    const clienteAlCobrar = clienteCobro;
    if (!clienteAlCobrar) {
      setError("Cliente no encontrado");
      setShowModalCobro(false);
      return;
    }
    if (evidenciaRequerida && !evidenciaFile) {
      setError("Transferencia: debes adjuntar 1 foto de evidencia.");
      setShowModalCobro(false);
      return;
    }
    const montoAplicarCobro = montoAplicar;

    const idempotencyKey = (() => {
      const existing = getCobroSnapshot(prestamoId, user.uid);
      if (existing?.prestamoId === prestamoId) return existing.key;
      return crypto.randomUUID();
    })();

    setCobroSnapshot(
      {
        key: idempotencyKey,
        prestamoId,
        monto: montoAplicarCobro,
        metodoPago,
        clienteId: clienteId ?? prestamoAlCobrar.clienteId,
      },
      user.uid
    );

    setError(null);
    setSubmitting(true);
    setSubmitStatus(null);
    try {
      const url =
        evidenciaFile
          ? await uploadImage(evidenciaFile, {
              folder: "pagos",
              ownerId: user.uid,
              filename: "auto",
            })
          : "";
      setSubmitStatus("Registrando pago…");
      const token = await user.getIdToken();
      const nombreRegistro = profile.displayName ?? profile.email ?? "";
      const res = await registrarPago(token, prestamoAlCobrar.id, {
        monto: montoAplicarCobro,
        metodoPago,
        evidencia: url || undefined,
        registradoPorUid: user.uid,
        registradoPorNombre: nombreRegistro || undefined,
        idempotencyKey,
      });
      clearCobroSnapshot(prestamoId, user.uid);
      const prestamoActualizado: PrestamoItem = {
        ...prestamoAlCobrar,
        saldoPendiente: res.saldoPendiente,
        estado: res.estado,
      };
      cobroConfirmadoRef.current = {
        cliente: clienteAlCobrar,
        prestamo: prestamoActualizado,
        montoAplicar: montoAplicarCobro,
      };
      setShowModalCobro(false);
      setConfirmado(true);
      setNuevoSaldoPendiente(res.saldoPendiente);
      setCliente(clienteAlCobrar);
      setPrestamo(prestamoActualizado);
      const nuevoPago: PagoItem = {
        id: res.pagoId ?? "",
        monto: montoAplicarCobro,
        fecha: new Date().toISOString(),
        tipo: "pago",
        metodoPago: metodoPago,
        registradoPorUid: user.uid,
        registradoPorNombre: nombreRegistro || null,
      };
      setUltimosPagos((prev) => [nuevoPago, ...prev]);
      await refreshLista();
      void refreshCajaDia();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("NetworkError") ||
        msg.includes("Failed to fetch")
      ) {
        setError("Sin conexión. Puedes reintentar — tu cobro no se duplicará.");
      } else {
        setError(msg || "Error al registrar cobro");
      }
    } finally {
      setSubmitting(false);
      setSubmitStatus(null);
    }
  };

  const handleRevisarNoPago = () => {
    if (!motivoNoPago || !user || !prestamoId || !profile) return;
    setError(null);
    setShowModalNoPago(true);
  };

  const handleRevisarPerdida = () => {
    if (!motivoPerdida || !user || !prestamoId || !profile || !prestamo) return;
    if ((prestamo.saldoPendiente ?? 0) <= 0) {
      setError("No hay saldo pendiente para registrar la pérdida");
      return;
    }
    setError(null);
    setShowModalPerdida(true);
  };

  const handleEjecutarNoPago = async () => {
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
      setShowModalNoPago(false);
      setNoPagoRegistrado(true);
      await refreshLista();
      void refreshCajaDia();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar no pago");
    } finally {
      setSubmittingNoPago(false);
    }
  };

  const handleEjecutarPerdida = async () => {
    if (!motivoPerdida || !user || !prestamoId || !profile || !prestamo) return;
    const montoPerdida = prestamo.saldoPendiente ?? 0;
    if (montoPerdida <= 0) {
      setError("No hay saldo pendiente para registrar la pérdida");
      return;
    }
    setSubmittingPerdida(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const nombreRegistro = profile.displayName ?? profile.email ?? "";
      await registrarPerdida(token, prestamoId, {
        monto: montoPerdida,
        motivoPerdida,
        nota: notaPerdida.trim() || undefined,
        registradoPorUid: user.uid,
        registradoPorNombre: nombreRegistro || undefined,
      });
      setShowPerdida(false);
      setShowModalPerdida(false);
      setSaldoPerdidaRegistrada(montoPerdida);
      setShowModalPerdidaExito(true);
      const cobrado = round2((prestamo.totalAPagar ?? 0) - (prestamo.saldoPendiente ?? 0));
      const capitalPerdido =
        cobrado < (prestamo.monto ?? 0) ? round2((prestamo.monto ?? 0) - cobrado) : 0;
      setPrestamo({
        ...prestamo,
        saldoPendiente: 0,
        estado: "castigado",
        cobradoAcumulado: cobrado,
        totalCastigado: (prestamo.totalCastigado ?? 0) + capitalPerdido,
        fechaCierre: new Date().toISOString(),
        cerradoPor: "castigo",
      });
      await refreshLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar pérdida");
    } finally {
      setSubmittingPerdida(false);
    }
  };

  if (!profile || (profile.role !== "trabajador" && profile.role !== "admin")) return null;
  const backHref = fromAdmin ? "/dashboard/admin/prestamo" : "/dashboard/trabajador/ruta";
  const backLabel = fromAdmin ? "Volver a Préstamos" : "Ruta del día";
  const renovarPrestamoHref = `/dashboard/${fromAdmin ? "admin" : "trabajador"}/prestamo?clienteId=${encodeURIComponent(clienteId ?? "")}`;
  if (!clienteId || !prestamoId) {
    return (
      <div className="card">
        <p>Faltan cliente o préstamo. <Link href={backHref}>{backLabel}</Link></p>
      </div>
    );
  }

  if (!recoveryChecked) {
    return (
      <div className="card">
        <p>Verificando estado del cobro...</p>
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

  const saldoTrasCobro = nuevoSaldoPendiente ?? 0;
  const cuotasRestantesTrasCobro =
    totalAPagar > 0 && numeroCuotas > 0
      ? Math.min(numeroCuotas, Math.ceil((saldoTrasCobro / totalAPagar) * numeroCuotas))
      : 0;

  if (confirmado) {
    const snap = cobroConfirmadoRef.current;
    const clienteCobro = cliente ?? snap?.cliente ?? null;
    const prestamoCobro = prestamo ?? snap?.prestamo ?? null;

    if (!clienteCobro || !prestamoCobro) {
      return (
        <div className="card cobrar-card cobrar-confirmacion">
          <h2 className="cobrar-title">Cobro registrado</h2>
          <p>El pago se guardó correctamente.</p>
          <Link href={backHref} className="btn btn-primary">{backLabel}</Link>
        </div>
      );
    }

    const montoCobroConfirmado = snap?.montoAplicar ?? montoAplicar;
    const totalAPagarCobro = prestamoCobro.totalAPagar ?? 0;
    const numeroCuotasCobro = prestamoCobro.numeroCuotas ?? 0;
    const cuotasRestantesCobro =
      totalAPagarCobro > 0 && numeroCuotasCobro > 0
        ? Math.min(
            numeroCuotasCobro,
            Math.ceil((saldoTrasCobro / totalAPagarCobro) * numeroCuotasCobro)
          )
        : 0;
    const prestamoSaldado = saldoTrasCobro === 0;
    const marcaComprobante = empresaComprobanteMeta.nombre?.trim() || "Empresa";
    const textoComprobanteWa =
      `Comprobante ${marcaComprobante} — ${clienteCobro.nombre}\n` +
      `Monto pagado: ${formatCurrency(montoCobroConfirmado)}\n` +
      `Saldo restante: ${formatCurrency(saldoTrasCobro)}\n` +
      `${new Date().toLocaleString("es-CO")}`;
    const mostrarPlaceholderCarga =
      !comprobanteDisplayUrl && (!comprobanteError || comprobanteGenerando);
    return (
      <div className="card cobrar-card cobrar-confirmacion">
        <h2 className="cobrar-title">Cobro registrado</h2>
        {prestamoSaldado && (
          <div className="cobrar-prestamo-saldado" role="status">
            <strong>Préstamo saldado.</strong> Este préstamo quedó pagado en su totalidad.
          </div>
        )}
        {comprobanteError && !comprobanteDisplayUrl && (
          <div className="cobrar-comprobante-error" role="alert">
            <p className="cobrar-comprobante-error-msg">Cobro registrado correctamente. No se pudo generar la imagen del comprobante para compartir.</p>
            <p className="cobrar-comprobante-error-detail">{comprobanteError}</p>
            <div className="cobrar-comprobante-error-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void reintentarComprobante()}
                disabled={comprobanteGenerando}
              >
                {comprobanteGenerando ? "Generando…" : "Reintentar comprobante"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => descargarComprobanteDesdeDOM()}
              >
                Descargar comprobante (desde pantalla)
              </button>
            </div>
          </div>
        )}
        {comprobanteDisplayUrl ? (
          <div className="comprobante-cobro comprobante-imagen-wrap">
            <img src={comprobanteDisplayUrl} alt="Comprobante de pago" className="comprobante-imagen" />
          </div>
        ) : (
          <>
            {mostrarPlaceholderCarga && (
              <div className="comprobante-placeholder" role="status" aria-live="polite" aria-busy={mostrarPlaceholderCarga}>
                <ComprobanteLoadingIcon />
                <span className="comprobante-placeholder-texto">Generando comprobante…</span>
                <span className="comprobante-placeholder-hint">Preparando imagen para compartir</span>
              </div>
            )}
            <div className="comprobante-capture-offscreen" aria-hidden="true">
              <div ref={comprobanteRef} className="comprobante-cobro comprobante-voucher" aria-label="Comprobante para el cliente">
                  <div className="voucher-header">
                    <div className="voucher-icon" aria-hidden>✓</div>
                    <h3 className="voucher-title">Pago exitoso</h3>
                    <p className="voucher-subtitle">Comprobante de pago</p>
                  </div>
                  <div className="voucher-monto">
                    <span className="voucher-monto-label">Monto pagado</span>
                    <span className="voucher-monto-value">{formatCurrency(montoCobroConfirmado)}</span>
                  </div>
                  <div className="voucher-rows">
                    <div className="voucher-row">
                      <span className="voucher-row-label">Cliente</span>
                      <span className="voucher-row-value">{clienteCobro.nombre}</span>
                    </div>
                    {clienteCobro.cedula && (
                      <div className="voucher-row">
                        <span className="voucher-row-label">Cédula</span>
                        <span className="voucher-row-value">{clienteCobro.cedula}</span>
                      </div>
                    )}
                    {clienteCobro.telefono && (
                      <div className="voucher-row">
                        <span className="voucher-row-label">Teléfono</span>
                        <span className="voucher-row-value">{clienteCobro.telefono}</span>
                      </div>
                    )}
                    <div className="voucher-row">
                      <span className="voucher-row-label">Cuotas restantes</span>
                      <span className="voucher-row-value">
                        {cuotasRestantesCobro} de {numeroCuotasCobro}
                      </span>
                    </div>
                    <div className="voucher-row">
                      <span className="voucher-row-label">Saldo restante</span>
                      <span className="voucher-row-value">{formatCurrency(saldoTrasCobro)}</span>
                    </div>
                  </div>
                  <div className="voucher-footer">
                    <p className="voucher-fecha">{new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}</p>
                    <p className="voucher-brand">{marcaComprobante} · Comprobante válido</p>
                  </div>
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
              disabled={!comprobanteDisplayUrl}
            >
              Compartir
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => descargarComprobanteDesdeDOM()}
              title="Descargar comprobante como imagen"
            >
              Descargar comprobante
            </button>
            {showShareMenu && (
              <div className="compartir-dropdown compartir-dropdown-wa" role="menu">
                <p className="compartir-pregunta">¿Enviar comprobante por WhatsApp?</p>
                <button
                  type="button"
                  className="compartir-opcion compartir-opcion-icono"
                  role="menuitem"
                  disabled={!comprobanteDisplayUrl}
                  onClick={async () => {
                    if (!comprobanteDisplayUrl) return;
                    setShowShareMenu(false);
                    setError(null);
                    try {
                      const blob = comprobanteBlobRef.current ?? await getImageBlob(comprobanteDisplayUrl);
                      const file = new File([blob], "comprobante-pago.png", { type: blob.type || "image/png" });
                      const hasShareApi = typeof navigator !== "undefined" && "share" in navigator;
                      const canShare = hasShareApi && (typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : true);
                      if (canShare) {
                        await navigator.share({ files: [file], title: "Comprobante de pago" });
                      } else {
                        const dl = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = dl;
                        a.download = "comprobante-pago.png";
                        a.click();
                        URL.revokeObjectURL(dl);
                        window.open("https://wa.me/?text=" + encodeURIComponent(textoComprobanteWa), "_blank", "noopener");
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error al compartir la imagen");
                    }
                  }}
                >
                  <span className="compartir-icono compartir-icono-wa" aria-hidden><WhatsAppIcon /></span>
                  <span>WhatsApp</span>
                </button>
              </div>
            )}
          </div>
          <Link href={backHref} className="btn btn-secondary">{backLabel}</Link>
        </div>
        {prestamoSaldado && (
          <div style={{
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--card-border)",
          }}>
            <p style={{
              margin: "0 0 0.65rem",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              fontWeight: 600,
            }}>
              Renovación
            </p>
            <p style={{
              margin: "0 0 0.75rem",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
            }}>
              El préstamo de {clienteCobro.nombre} quedó saldado. ¿Deseas crear un nuevo préstamo?
            </p>
            <Link
              href={renovarPrestamoHref}
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Renovar préstamo
            </Link>
          </div>
        )}
      </div>
    );
  }

  if (!cliente || !prestamo) {
    return (
      <div className="card">
        <p> <Link href={backHref}>{backLabel}</Link></p>
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
    const motivoNoPagoLabel =
      MOTIVOS_NO_PAGO.find((m) => m.value === motivoNoPago)?.label ?? motivoNoPago;
    const notaNoPagoTrim = notaNoPago.trim();
    return (
      <div className="card cobrar-card">
        <div className="cobrar-header">
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
            onClick={() => {
              setShowModalNoPago(false);
              setShowNoPago(false);
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!motivoNoPago || submittingNoPago || showModalNoPago}
            onClick={handleRevisarNoPago}
          >
            Confirmar no pago
          </button>
        </div>

        {showModalNoPago && (
          <ModalConfirmar
            titulo="Confirmar no pago"
            labelConfirmar="Sí, registrar no pago"
            confirmando={submittingNoPago}
            onCancelar={() => {
              if (submittingNoPago) return;
              setShowModalNoPago(false);
            }}
            onConfirmar={() => { void handleEjecutarNoPago(); }}
          >
            <p>
              ¿Confirmas registrar que <strong>{cliente.nombre}</strong> no realizó el pago en esta visita?
            </p>
            <p>
              Motivo: <strong>{motivoNoPagoLabel}</strong>
            </p>
            {notaNoPagoTrim && (
              <p>
                Nota: <strong>{notaNoPagoTrim}</strong>
              </p>
            )}
          </ModalConfirmar>
        )}
      </div>
    );
  }

  if (showPerdida && cliente && prestamo) {
    const motivoPerdidaLabel =
      MOTIVOS_PERDIDA.find((m) => m.value === motivoPerdida)?.label ?? motivoPerdida;
    const notaPerdidaTrim = notaPerdida.trim();
    return (
      <div className="card cobrar-card">
        <div className="cobrar-header">
          <h2 className="cobrar-title">Registrar pérdida</h2>
          <p className="cobrar-subtitle">{cliente.nombre}</p>
        </div>
        <p className="cobrar-text">
          Indica el motivo para castigar el saldo pendiente del préstamo. Esta acción no se puede deshacer.
        </p>
        {desglosePerdida ? (
          <>
            <p style={{ fontSize: "0.9375rem", marginTop: "0.25rem" }}>
              Saldo pendiente:{" "}
              <strong>{formatCurrency(desglosePerdida.saldoPendiente)}</strong>
            </p>
            <div
              style={{
                background: "var(--bg)",
                borderRadius: "var(--radius)",
                padding: "0.75rem",
                fontSize: "0.875rem",
                marginTop: "0.5rem",
              }}
            >
              <p style={{ margin: "0 0 0.35rem", color: "var(--text-muted)" }}>
                Impacto real en la ruta:
              </p>
              {desglosePerdida.capitalNoRecuperado > 0 ? (
                <>
                  <p style={{ margin: "0 0 0.25rem" }}>
                    Capital a descontar de inversiones:{" "}
                    <strong style={{ color: "var(--danger, #dc2626)" }}>
                      {formatCurrency(desglosePerdida.capitalNoRecuperado)}
                    </strong>
                  </p>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    Los {formatCurrency(desglosePerdida.interesNoCobradoEnSaldo)} restantes
                    corresponden a interés no cobrado.
                  </p>
                </>
              ) : (
                <p style={{ margin: 0 }}>
                  Capital ya recuperado completo — solo se ajustan ganancias.
                </p>
              )}
            </div>
          </>
        ) : null}
        <div className="form-group" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="cobrar-motivo-perdida">Motivo</label>
          <select
            id="cobrar-motivo-perdida"
            value={motivoPerdida}
            onChange={(e) => setMotivoPerdida(e.target.value as MotivoPerdida)}
            className="cobrar-select"
            disabled={submittingPerdida}
          >
            <option value="">Seleccionar...</option>
            {MOTIVOS_PERDIDA.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="cobrar-nota-perdida">Nota (opcional)</label>
          <input
            id="cobrar-nota-perdida"
            type="text"
            value={notaPerdida}
            onChange={(e) => setNotaPerdida(e.target.value)}
            placeholder="Detalle adicional"
            className="cobrar-input"
            disabled={submittingPerdida}
          />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <div className="cobrar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setShowModalPerdida(false);
              setShowPerdida(false);
            }}
            disabled={submittingPerdida}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              !motivoPerdida ||
              (prestamo.saldoPendiente ?? 0) <= 0 ||
              submittingPerdida ||
              showModalPerdida
            }
            onClick={handleRevisarPerdida}
          >
            Revisar pérdida
          </button>
        </div>

        {showModalPerdida && (
          <ModalConfirmar
            titulo="Confirmar pérdida"
            labelConfirmar="Sí, registrar pérdida"
            confirmando={submittingPerdida}
            onCancelar={() => {
              if (submittingPerdida) return;
              setShowModalPerdida(false);
            }}
            onConfirmar={() => { void handleEjecutarPerdida(); }}
          >
            <p>
              ¿Confirmas registrar la pérdida del préstamo de <strong>{cliente.nombre}</strong>?
            </p>
            {desglosePerdida ? (
              desglosePerdida.capitalNoRecuperado > 0 ? (
                <p>
                  Capital a descontar de inversiones:{" "}
                  <strong style={{ color: "var(--danger, #dc2626)" }}>
                    {formatCurrency(desglosePerdida.capitalNoRecuperado)}
                  </strong>
                </p>
              ) : (
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  Capital ya recuperado completo — solo se ajustan ganancias en la ruta.
                </p>
              )
            ) : null}
            <p>
              Motivo: <strong>{motivoPerdidaLabel}</strong>
            </p>
            {notaPerdidaTrim ? (
              <p>
                Nota: <strong>{notaPerdidaTrim}</strong>
              </p>
            ) : null}
            
          </ModalConfirmar>
        )}
      </div>
    );
  }

  const pagosHistorial = ultimosPagos;
  const formatFechaPago = (f: string | null) =>
    f ? new Date(f).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="card cobrar-card">
      <div className="cobrar-header">
        <div className="cobrar-header-top">
          <Link href={backHref} className="cobrar-back">← {backLabel}</Link>
          {profile?.role === "admin" && prestamo.saldoPendiente > 0 && (
            <button
              type="button"
              className="btn btn-secondary cobrar-btn-perdida"
              onClick={() => {
                setError(null);
                setMotivoPerdida("");
                setNotaPerdida("");
                setShowPerdida(true);
              }}
            >
              Pérdida
            </button>
          )}
        </div>
        <h2 className="cobrar-title">{cliente.nombre}</h2>
        <p className="cobrar-subtitle">
          Saldo pendiente · {prestamo.modalidad} · Estado: {labelEstadoPrestamo(prestamo)}
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
            {pagosHistorial.length} registro{pagosHistorial.length !== 1 ? "s" : ""}
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
          {pagosHistorial.length === 0 ? (
            <p className="cobrar-historial-empty">Aún no hay pagos registrados en este préstamo.</p>
          ) : (
            <ul className="cobrar-historial-ul">
              {pagosHistorial.map((p, idx) => (
                <li key={p.id || `p-${idx}`} className="cobrar-historial-li">
                  <span className="cobrar-historial-fecha">{formatFechaPago(p.fecha)}</span>
                  <span className="cobrar-historial-monto">{formatCurrency(p.monto)}</span>
                  <span
                    className="cobrar-historial-metodo"
                    style={{
                      color:
                        p.tipo === "perdida"
                          ? "var(--danger, #f87171)"
                          : p.tipo === "no_pago"
                            ? "var(--warning, #eab308)"
                            : "inherit",
                    }}
                  >
                    {p.tipo === "perdida"
                      ? "Pérdida"
                      : p.tipo === "no_pago"
                        ? `No pagó${
                            p.motivoNoPago
                              ? ` — ${MOTIVOS_NO_PAGO.find((m) => m.value === p.motivoNoPago)?.label ?? p.motivoNoPago}`
                              : ""
                          }`
                        : p.metodoPago === "transferencia"
                          ? "Transferencia"
                          : "Efectivo"}
                  </span>
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
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Valor de la cuota</span>
          <span className="cobrar-metrica-value">
            {valorCuotaFija > 0 ? formatCurrency(Math.round(valorCuotaFija)) : "—"}
          </span>
        </div>
      </div>

      <form onSubmit={handleRevisarCobro} className="cobrar-form">
        <div className="form-group">
          <label>Monto a recibir</label>
          <input
            type="text"
            inputMode="decimal"
            value={montoInput ? formatMontoDecimalCOPDisplay(montoInput) : ""}
            onChange={(e) => setMontoInput(sanitizeMontoDecimalCOP(e.target.value))}
            className="cobrar-input cobrar-input-monto"
          />
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

        {metodoPago === "transferencia" && (
          <div className="form-group">
            <label>Evidencia del pago (obligatoria)</label>
            <p className="cobrar-evidencia-hint">
              Transferencia: adjunta 1 foto (subir o tomar con cámara).
            </p>
            <div className="cobrar-evidencia-slots">
              <div className="cobrar-evidencia-slot">
                <span className="cobrar-evidencia-slot-label">Foto 1</span>
                {evidenciaPreview ? (
                  <div className="cobrar-evidencia-preview">
                    <img src={evidenciaPreview} alt="Evidencia 1" />
                    <button
                      type="button"
                      className="cobrar-evidencia-remove"
                      onClick={() => setEvidencia(null)}
                      aria-label="Quitar foto"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ) : (
                  <div className="cobrar-evidencia-buttons">
                    <input
                      ref={fileInputRef0}
                      type="file"
                      accept={getImageAccept()}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setEvidencia(file);
                        e.target.value = "";
                      }}
                      className="cobrar-file-hidden"
                      aria-label="Subir foto 1"
                    />
                    <button
                      type="button"
                      className="cobrar-evidencia-btn"
                      onClick={() => fileInputRef0.current?.click()}
                      aria-label="Subir imagen 1"
                    >
                      <UploadIcon />
                      <span>Subir imagen</span>
                    </button>
                    <button
                      type="button"
                      className="cobrar-evidencia-btn"
                      onClick={() => {
                        setCameraSlot(0);
                        setCameraError(null);
                        setShowCamera(true);
                      }}
                      aria-label="Tomar foto 1"
                    >
                      <CameraIcon />
                      <span>Tomar foto</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
                    void captureVideoFrameAsJpeg(video, `evidencia-${cameraSlot + 1}`)
                      .then((file) => {
                        setEvidencia(file);
                        streamRef.current?.getTracks().forEach((t) => t.stop());
                        streamRef.current = null;
                        if (video) video.srcObject = null;
                        setShowCamera(false);
                      })
                      .catch(() => setError("No se pudo capturar la imagen"));
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
            disabled={!puedeConfirmar || submitting || showModalCobro}
          >
            Confirmar cobro
          </button>
        </div>
      </form>

      {showModalCobro && prestamo && clienteCobro && (
        <ModalConfirmar
          titulo="Confirmar cobro"
          labelConfirmar="Sí, registrar cobro"
          confirmando={submitting}
          onCancelar={() => setShowModalCobro(false)}
          onConfirmar={() => { void handleEjecutarCobro(); }}
        >
          <p>
            ¿Confirmas el cobro de <strong>{formatCurrency(montoAplicar)}</strong> a{" "}
            <strong>{clienteCobro.nombre}</strong>?
          </p>
          <p>
            Método: <strong>{metodoPago === "efectivo" ? "Efectivo" : "Transferencia"}</strong>
          </p>
          <p>
            Saldo restante tras el cobro:{" "}
            <strong>{formatCurrency(Math.max(0, saldoPendiente - montoAplicar))}</strong>
          </p>
        </ModalConfirmar>
      )}

      {showModalPerdidaExito && (
        <ModalConfirmar
          titulo="Pérdida registrada"
          labelConfirmar={backLabel}
          ocultarCancelar
          cerrarConBackdrop={false}
          onCancelar={() => {}}
          onConfirmar={() => router.push(backHref)}
        >
          <p>
            La pérdida de <strong>{cliente.nombre}</strong> fue registrada por{" "}
            <strong>{formatCurrency(saldoPerdidaRegistrada)}</strong>.
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            Se recomienda marcar al cliente como moroso para no volverle a prestar.
          </p>
        </ModalConfirmar>
      )}
    </div>
  );
}

/** useSearchParams requiere Suspense en el App Router para no dejar la ruta en blanco durante el render. */
export default function CobrarClientePage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
          <p>Cargando cobro...</p>
        </div>
      }
    >
      <CobrarClientePageContent />
    </Suspense>
  );
}
