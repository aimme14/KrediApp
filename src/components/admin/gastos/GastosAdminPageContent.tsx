"use client";

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import Link from "next/link";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { db } from "@/lib/firebase";
import {
  createGasto,
  type GastoItem,
} from "@/lib/empresa-api";
import {
  sanitizeMontoDecimalCOP,
  formatMontoDecimalCOPDisplay,
  interiorDecimalCOPToNumber,
} from "@/lib/monto-input-es";
import { uploadImage, IMAGE_ACCEPT, getImageAccept } from "@/lib/storage";
import { captureVideoFrameAsJpeg } from "@/lib/image-utils";
import {
  fechaDiaColombiaHoy,
  formatoFechaGastoColombia,
} from "@/lib/colombia-day-bounds";
import { esGastoDelDiaColombia } from "@/lib/gastos-periodo-filter";
import { OFFLINE_MSG, useOnline } from "@/hooks/useOnline";
import dynamic from "next/dynamic";
import { isAdminPanelRole } from "@/lib/admin-panel-role";

const ModalConfirmar = dynamic(
  () => import("@/components/trabajador/ModalConfirmar").then((m) => ({ default: m.ModalConfirmar })),
  { ssr: false }
);

const EMPRESAS_COLLECTION = "empresas";
const GASTOS_ADMIN_SUBCOLLECTION = "gastosAdministrador";
const GASTOS_EMPLEADO_SUBCOLLECTION = "gastosEmpleado";

const TIPOS = [
  { value: "transporte", label: "Transporte", icon: "transporte" },
  { value: "alimentacion", label: "Alimentación", icon: "alimentacion" },
  { value: "otro", label: "Otro", icon: "otro" },
] as const;

const LISTA_PAGE_SIZE = 10;

type GastoSource = "admin" | "empleado";

type BufferedGasto = {
  key: string;
  source: GastoSource;
  item: GastoItem;
};

function mapGastoDoc(
  d: QueryDocumentSnapshot,
  alcanceOverride?: string
): GastoItem {
  const data = d.data();
  return {
    id: d.id,
    descripcion: String(data.descripcion ?? ""),
    monto: typeof data.monto === "number" ? data.monto : 0,
    fecha:
      typeof (data.fecha as { toDate?: () => Date })?.toDate === "function"
        ? (data.fecha as { toDate: () => Date }).toDate().toISOString()
        : null,
    tipo: String(data.tipo ?? "otro"),
    creadoPor: String(data.creadoPor ?? ""),
    creadoPorNombre: String(data.creadoPorNombre ?? ""),
    rol: String(data.rol ?? "admin"),
    rutaId: String(data.rutaId ?? ""),
    adminId: String(data.adminId ?? ""),
    empleadoId: String(data.empleadoId ?? ""),
    evidencia: String(data.evidencia ?? ""),
    alcance: alcanceOverride ?? String(data.alcance ?? ""),
  };
}

function sortBufferedByFechaDesc(items: BufferedGasto[]): BufferedGasto[] {
  return [...items].sort(
    (a, b) =>
      (b.item.fecha ? new Date(b.item.fecha).getTime() : 0) -
      (a.item.fecha ? new Date(a.item.fecha).getTime() : 0)
  );
}

function mergeBufferedUnique(
  existing: BufferedGasto[],
  incoming: BufferedGasto[]
): BufferedGasto[] {
  const byKey = new Map<string, BufferedGasto>();
  existing.forEach((g) => byKey.set(g.key, g));
  incoming.forEach((g) => byKey.set(g.key, g));
  return sortBufferedByFechaDesc(Array.from(byKey.values()));
}

type TipoGasto = (typeof TIPOS)[number]["value"];

type PendingGastoData = {
  monto: number;
  tipo: TipoGasto;
  motivo: string;
  conEvidencia: boolean;
  alcance: "admin" | "ruta";
  rutaId?: string;
  rutaNombre?: string;
};

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

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function GastosAdminPageContent() {
  const { user, profile } = useAuth();
  const { rutas, rutasConEmpleados } = useAdminDashboard();
  const online = useOnline();
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hayMasGastos, setHayMasGastos] = useState(false);
  const [proximaCantidad, setProximaCantidad] = useState(LISTA_PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState<"transporte" | "alimentacion" | "otro">("otro");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [motivoOverlay, setMotivoOverlay] = useState<string | null>(null);
  const [gastoDetalle, setGastoDetalle] = useState<GastoItem | null>(null);
  const [soloHoy, setSoloHoy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [alcanceGasto, setAlcanceGasto] = useState<"admin" | "ruta">("admin");
  const [rutaIdGasto, setRutaIdGasto] = useState("");
  const [showModalGasto, setShowModalGasto] = useState(false);
  const [pendingGastoData, setPendingGastoData] = useState<PendingGastoData | null>(null);
  const [confirmarGastoMarcado, setConfirmarGastoMarcado] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const bufferRef = useRef<BufferedGasto[]>([]);
  const lastDocAdminRef = useRef<QueryDocumentSnapshot | null>(null);
  const lastDocEmpleadoRef = useRef<QueryDocumentSnapshot | null>(null);
  const exhaustedAdminRef = useRef(false);
  const exhaustedEmpleadoRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const gastoKeysRef = useRef<Set<string>>(new Set());

  const syncHayMas = useCallback(() => {
    const bufLen = bufferRef.current.length;
    const hasMore =
      bufLen > 0 || !exhaustedAdminRef.current || !exhaustedEmpleadoRef.current;
    setHayMasGastos(hasMore);
    if (bufLen > 0) setProximaCantidad(Math.min(LISTA_PAGE_SIZE, bufLen));
    else if (hasMore) setProximaCantidad(LISTA_PAGE_SIZE);
    else setProximaCantidad(0);
  }, []);

  const pullSourceBatch = useCallback(
    async (source: GastoSource, empresaId: string, adminUid: string) => {
      if (!db) return;
      if (source === "admin" && exhaustedAdminRef.current) return;
      if (source === "empleado" && exhaustedEmpleadoRef.current) return;

      const colName =
        source === "admin" ? GASTOS_ADMIN_SUBCOLLECTION : GASTOS_EMPLEADO_SUBCOLLECTION;
      const lastDoc = source === "admin" ? lastDocAdminRef.current : lastDocEmpleadoRef.current;

      const constraints: QueryConstraint[] = [
        where("adminId", "==", adminUid),
        orderBy("fecha", "desc"),
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));
      constraints.push(limit(LISTA_PAGE_SIZE));

      const snap = await getDocs(
        query(collection(db, EMPRESAS_COLLECTION, empresaId, colName), ...constraints)
      );

      if (snap.docs.length < LISTA_PAGE_SIZE) {
        if (source === "admin") exhaustedAdminRef.current = true;
        else exhaustedEmpleadoRef.current = true;
      }
      if (snap.docs.length > 0) {
        const last = snap.docs[snap.docs.length - 1] ?? null;
        if (source === "admin") lastDocAdminRef.current = last;
        else lastDocEmpleadoRef.current = last;
      } else if (source === "admin") {
        exhaustedAdminRef.current = true;
      } else {
        exhaustedEmpleadoRef.current = true;
      }

      const mapped: BufferedGasto[] = snap.docs.map((d) => ({
        key: `${source}-${d.id}`,
        source,
        item: mapGastoDoc(d, source === "empleado" ? "empleado" : undefined),
      }));
      bufferRef.current = mergeBufferedUnique(bufferRef.current, mapped);
    },
    []
  );

  const ensureBuffer = useCallback(
    async (minSize: number, empresaId: string, adminUid: string) => {
      while (
        bufferRef.current.length < minSize &&
        (!exhaustedAdminRef.current || !exhaustedEmpleadoRef.current)
      ) {
        const before = bufferRef.current.length;
        await Promise.all([
          pullSourceBatch("admin", empresaId, adminUid),
          pullSourceBatch("empleado", empresaId, adminUid),
        ]);
        if (bufferRef.current.length === before) break;
      }
    },
    [pullSourceBatch]
  );

  const takeFromBuffer = useCallback((count: number): GastoItem[] => {
    const taken: GastoItem[] = [];
    const remaining: BufferedGasto[] = [];
    for (const entry of bufferRef.current) {
      if (taken.length < count && !gastoKeysRef.current.has(entry.key)) {
        gastoKeysRef.current.add(entry.key);
        taken.push(entry.item);
      } else if (!gastoKeysRef.current.has(entry.key)) {
        remaining.push(entry);
      }
    }
    bufferRef.current = remaining;
    return taken;
  }, []);

  const cargarPaginaGastos = useCallback(
    async (opts?: { reset?: boolean }) => {
      if (!db || !user?.uid || !profile?.empresaId) return;
      const empresaId = profile.empresaId.trim();
      if (!empresaId) return;
      if (loadingMoreRef.current) return;

      const reset = opts?.reset === true;
      loadingMoreRef.current = true;
      if (reset) {
        setLoading(true);
        setError(null);
        bufferRef.current = [];
        lastDocAdminRef.current = null;
        lastDocEmpleadoRef.current = null;
        exhaustedAdminRef.current = false;
        exhaustedEmpleadoRef.current = false;
        gastoKeysRef.current = new Set();
        setGastos([]);
        setHayMasGastos(false);
      } else {
        setLoadingMore(true);
      }

      try {
        await ensureBuffer(LISTA_PAGE_SIZE, empresaId, user.uid);
        const next = takeFromBuffer(LISTA_PAGE_SIZE);
        if (reset) {
          setGastos(next);
        } else if (next.length > 0) {
          setGastos((prev) =>
            [...prev, ...next].sort(
              (a, b) =>
                (b.fecha ? new Date(b.fecha).getTime() : 0) -
                (a.fecha ? new Date(a.fecha).getTime() : 0)
            )
          );
        }
        syncHayMas();
      } catch (err) {
        console.warn("[GastosAdmin] paginación gastos:", err);
        setError("No se pudieron cargar los gastos");
        syncHayMas();
      } finally {
        loadingMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user?.uid, profile?.empresaId, ensureBuffer, takeFromBuffer, syncHayMas]
  );

  const empresaId = profile?.empresaId?.trim() ?? "";
  const adminUid = user?.uid ?? "";

  useEffect(() => {
    if (!adminUid || !empresaId) return;
    void cargarPaginaGastos({ reset: true });
  }, [adminUid, empresaId, cargarPaginaGastos]);

  const gastosVisibles = useMemo(() => {
    const hoy = fechaDiaColombiaHoy();
    const base = soloHoy
      ? gastos.filter((g) => esGastoDelDiaColombia(g.fecha, hoy))
      : gastos;
    const searchLower = searchQuery.trim().toLowerCase();
    const filtrados = searchLower
      ? base.filter((g) => {
          const motivoTxt = (g.descripcion ?? "").toLowerCase();
          const tipoTxt = (g.tipo ?? "").toLowerCase();
          const hechoPor = (g.creadoPorNombre ?? "").toLowerCase();
          const montoStr = (g.monto ?? 0).toFixed(2);
          const fechaStr = formatoFechaGastoColombia(g.fecha ?? null).replace("—", "").trim().toLowerCase();
          return (
            motivoTxt.includes(searchLower) ||
            tipoTxt.includes(searchLower) ||
            hechoPor.includes(searchLower) ||
            montoStr.includes(searchLower) ||
            fechaStr.includes(searchLower)
          );
        })
      : base;
    return [...filtrados].sort((a, b) => {
      const timeA = new Date(a.fecha ?? 0).getTime();
      const timeB = new Date(b.fecha ?? 0).getTime();
      return timeB - timeA;
    });
  }, [gastos, searchQuery, soloHoy]);

  /** Mapa uid → nombre real (admin actual + empleados de sus rutas). */
  const nombrePorUid = useMemo(() => {
    const m = new Map<string, string>();
    if (user?.uid) {
      const propio = user.displayName?.trim() || profile?.displayName?.trim();
      if (propio) m.set(user.uid, propio);
    }
    rutasConEmpleados.forEach((r) =>
      r.empleados.forEach((e) => {
        if (e.nombre?.trim()) m.set(e.uid, e.nombre.trim());
      })
    );
    return m;
  }, [user?.uid, user?.displayName, profile?.displayName, rutasConEmpleados]);

  /**
   * Nombre a mostrar para un gasto: usa el nombre guardado si es real;
   * si se guardó el UID (datos sin displayName), lo resuelve por el mapa;
   * como último recurso muestra "Tú".
   */
  const nombreMostrado = useCallback(
    (g: GastoItem): string => {
      const raw = (g.creadoPorNombre ?? "").trim();
      if (raw && raw !== g.creadoPor) return raw;
      const real = nombrePorUid.get(g.creadoPor);
      if (real) return real;
      if (g.creadoPor && g.creadoPor === user?.uid) {
        return user.displayName?.trim() || "Tú";
      }
      return "Tú";
    },
    [nombrePorUid, user?.uid, user?.displayName]
  );

  const handleMostrarMas = () => {
    if (loadingMore || !hayMasGastos) return;
    void cargarPaginaGastos();
  };

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
    void captureVideoFrameAsJpeg(video, "evidencia")
      .then((file) => {
        setFileFromInput(file);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (video) video.srcObject = null;
        setShowCamera(false);
      })
      .catch(() => setError("No se pudo capturar la imagen"));
  };

  const handleCloseCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setShowCamera(false);
    setCameraError(null);
  };

  const handleRevisarGasto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
    if (!user || !profile) return;
    const montoNum = interiorDecimalCOPToNumber(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      setError("El motivo es obligatorio");
      return;
    }
    if (alcanceGasto === "ruta" && !rutaIdGasto.trim()) {
      setError("Selecciona la ruta a la que corresponde el gasto.");
      return;
    }
    const rutaSel = alcanceGasto === "ruta" ? rutas.find((r) => r.id === rutaIdGasto.trim()) : undefined;
    setError(null);
    setConfirmarGastoMarcado(false);
    setPendingGastoData({
      monto: montoNum,
      tipo,
      motivo: motivoTrim,
      conEvidencia: !!evidenciaFile,
      alcance: alcanceGasto,
      rutaId: alcanceGasto === "ruta" ? rutaIdGasto.trim() : undefined,
      rutaNombre: rutaSel?.nombre ?? undefined,
    });
    setShowModalGasto(true);
  };

  const handleEjecutarGasto = async (data: PendingGastoData) => {
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
    if (!user || !profile) return;
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
        descripcion: data.motivo,
        monto: data.monto,
        fecha: fechaDiaColombiaHoy(),
        tipo: data.tipo,
        evidencia: evidenciaUrl || undefined,
        alcance: data.alcance,
        rutaId: data.alcance === "ruta" ? data.rutaId : undefined,
        creadoPorNombre: user?.displayName ?? undefined,
      });
      setMotivo("");
      setMonto("");
      setTipo("otro");
      setAlcanceGasto("admin");
      setRutaIdGasto("");
      setEvidenciaFile(null);
      setEvidenciaPreview(null);
      setPendingGastoData(null);
      setShowModalGasto(false);
      setConfirmarGastoMarcado(false);
      setShowForm(false);
      // Lista deja de ser tiempo-real: recargar primera página con el gasto nuevo.
      loadingMoreRef.current = false;
      await cargarPaginaGastos({ reset: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar gasto");
    } finally {
      setCreating(false);
    }
  };

  const alcanceGastoLabel = (alcance: PendingGastoData["alcance"]) =>
    alcance === "ruta" ? "Ruta" : "Administrador";

  if (!profile || !isAdminPanelRole(profile.role)) return null;

  function renderAlcance(g: GastoItem): ReactNode {
    const a = (g.alcance ?? "").trim();
    if (a === "empleado") {
      const r = g.rutaId ? rutas.find((x) => x.id === g.rutaId) : undefined;
      return (
        <span className="gastos-admin-alcance">
          <span className="gastos-admin-alcance-line">Trabajador</span>
          {r ? <span className="gastos-admin-alcance-sub">{r.nombre}</span> : null}
        </span>
      );
    }
    if (a === "ruta") {
      const r = rutas.find((x) => x.id === g.rutaId);
      return (
        <span className="gastos-admin-alcance">
          <span className="gastos-admin-alcance-line">Ruta</span>
          {r ? <span className="gastos-admin-alcance-sub">{r.nombre}</span> : null}
        </span>
      );
    }
    if (a === "admin") {
      return (
        <span className="gastos-admin-alcance">
          <span className="gastos-admin-alcance-line">Administrador</span>
        </span>
      );
    }
    return (
      <span className="gastos-admin-alcance">
        <span className="gastos-admin-alcance-line">{g.rutaId ? "Ruta (hist.)" : "Administrador"}</span>
      </span>
    );
  }

  return (
    <div className="card gastos-admin-page">
      <h2 className="gastos-admin-title">Gastos operativos</h2>
      

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
          <form onSubmit={handleRevisarGasto} className="gastos-form" noValidate>
            <div className="form-group">
              <label htmlFor="gastos-monto">Monto <span className="form-required" aria-hidden>*</span></label>
              <input
                id="gastos-monto"
                type="text"
                inputMode="decimal"
                value={monto ? formatMontoDecimalCOPDisplay(monto) : ""}
                onChange={(e) => setMonto(sanitizeMontoDecimalCOP(e.target.value))}
                required
                placeholder="Ej: 15000"
                aria-required="true"
                aria-invalid={error ? true : undefined}
              />
            </div>

            <div className="form-group">
              <span className="gastos-tipo-label">Tipo de gasto <span className="form-required" aria-hidden>*</span></span>
              <div className="gastos-tipo-buttons gastos-tipo-buttons-tipos" role="group" aria-label="Tipo de gasto">
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
              <span className="gastos-tipo-label">Ámbito del gasto <span className="form-required" aria-hidden>*</span></span>
              <div className="gastos-tipo-buttons gastos-tipo-buttons-alcance" role="group" aria-label="Ámbito del gasto">
                <button
                  type="button"
                  className={`gastos-tipo-btn ${alcanceGasto === "admin" ? "gastos-tipo-btn-active" : ""}`}
                  onClick={() => { setAlcanceGasto("admin"); setRutaIdGasto(""); }}
                  aria-pressed={alcanceGasto === "admin"}
                >
                  <span>Administrador</span>
                </button>
                <button
                  type="button"
                  className={`gastos-tipo-btn ${alcanceGasto === "ruta" ? "gastos-tipo-btn-active" : ""}`}
                  onClick={() => setAlcanceGasto("ruta")}
                  aria-pressed={alcanceGasto === "ruta"}
                >
                  <span>Una ruta</span>
                </button>
              </div>
            </div>

            {alcanceGasto === "ruta" && (
              <div className="form-group">
                <label htmlFor="gastos-ruta">Ruta <span className="form-required" aria-hidden>*</span></label>
                <select
                  id="gastos-ruta"
                  value={rutaIdGasto}
                  onChange={(e) => setRutaIdGasto(e.target.value)}
                  required
                  aria-required="true"
                >
                  <option value="">— Seleccionar ruta —</option>
                  {rutas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre ?? r.id}
                      {r.codigo ? ` (${r.codigo})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="gastos-motivo">Motivo <span className="form-required" aria-hidden>*</span></label>
              <textarea
                id="gastos-motivo"
                className="gastos-admin-motivo-field"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
                rows={1}
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
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating || showModalGasto || !online}
                aria-busy={creating}
              >
                Registrar gasto
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
      <div className="card gastos-admin-historial-card">
        <div className="gastos-admin-hist-top">
          <div>
            <h3 className="gastos-admin-hist-title">Historial de gastos</h3>
            {!loading && gastos.length > 0 && (
              <p className="gastos-registros-msg gastos-admin-hist-meta">
                {gastosVisibles.length} registro{gastosVisibles.length !== 1 ? "s" : ""} encontrado{gastosVisibles.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary gastos-admin-add-btn"
            onClick={() => setShowForm(true)}
            aria-label="Agregar gasto"
            title="Agregar gasto"
          >
            <PlusIcon />
            <span className="gastos-btn-agregar-text">Agregar gasto</span>
          </button>
        </div>
        {loading ? (
          <p className="gastos-loading-msg">Cargando...</p>
        ) : gastos.length === 0 ? (
          <p className="gastos-empty-msg">No hay gastos registrados.</p>
        ) : (
          <>
            <div className="gastos-admin-toolbar">
              <div
                className="gastos-periodo-filter"
                role="group"
                aria-label="Filtrar gastos por día"
              >
                <button
                  type="button"
                  className={`gastos-periodo-btn ${!soloHoy ? "gastos-periodo-btn-active" : ""}`}
                  onClick={() => setSoloHoy(false)}
                  aria-pressed={!soloHoy}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`gastos-periodo-btn ${soloHoy ? "gastos-periodo-btn-active" : ""}`}
                  onClick={() => setSoloHoy(true)}
                  aria-pressed={soloHoy}
                >
                  Hoy
                </button>
              </div>
              <div className="gastos-admin-search-field">
                <span className="gastos-admin-search-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <input
                  id="gastos-buscador"
                  className="gastos-admin-search-input"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, tipo, monto o fecha..."
                  aria-label="Buscar en historial de gastos"
                />
              </div>
              {searchQuery.trim() || soloHoy ? (
                <p className="gastos-resultados-msg gastos-admin-search-hint">
                  {gastosVisibles.length} resultado{gastosVisibles.length !== 1 ? "s" : ""}
                  {soloHoy ? " de hoy" : ""}
                </p>
              ) : null}
            </div>
            {gastosVisibles.length === 0 ? (
              <p className="gastos-empty-msg">
                {searchQuery.trim()
                  ? "Ningún gasto coincide con la búsqueda."
                  : soloHoy
                    ? "No hay gastos registrados hoy."
                    : "No hay gastos registrados."}
              </p>
            ) : (
            <>
            <div className="gastos-admin-mobile-list" role="list" aria-label="Lista de gastos">
              {gastosVisibles.map((g) => (
                <div key={`${g.rol}-${g.id}-mobile`} className="gastos-admin-mobile-row" role="listitem">
                  <span className="gastos-admin-mobile-nombre" title={nombreMostrado(g)}>
                    {nombreMostrado(g)}
                  </span>
                  <span className="gastos-admin-mobile-fecha">
                    {formatoFechaGastoColombia(g.fecha ?? null)}
                  </span>
                  <button
                    type="button"
                    className="gastos-admin-mobile-ver-btn"
                    onClick={() => setGastoDetalle(g)}
                    aria-label={`Ver detalle del gasto de ${nombreMostrado(g)}`}
                  >
                    <EyeIcon />
                  </button>
                </div>
              ))}
            </div>
            <div className="table-wrap gastos-table-wrap gastos-admin-table-wrap gastos-admin-table-desktop">
              <table className="gastos-table gastos-admin-table">
                <thead>
                  <tr>
                    <th className="gastos-col-nombre">Nombre</th>
                    <th className="gastos-col-fecha">Fecha</th>
                    <th className="gastos-col-tipo">Tipo</th>
                    <th className="gastos-col-alcance">Ámbito</th>
                    <th className="gastos-col-monto">Monto</th>
                    <th className="gastos-col-evidencia">Evidencia</th>
                    <th className="gastos-col-motivo">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {gastosVisibles.map((g) => (
                  <tr key={`${g.rol}-${g.id}`}>
                    <td className="gastos-col-nombre" title={nombreMostrado(g)}>{nombreMostrado(g)}</td>
                    <td className="gastos-col-fecha">{formatoFechaGastoColombia(g.fecha ?? null)}</td>
                    <td className="gastos-col-tipo">{tipoLabel(g.tipo ?? "")}</td>
                    <td className="gastos-col-alcance">{renderAlcance(g)}</td>
                    <td className="gastos-col-monto">{formatMoneda(g.monto ?? 0)}</td>
                    <td className="gastos-col-evidencia">
                      {g.evidencia ? (
                        <a
                          href={g.evidencia}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gastos-ver-motivo-btn gastos-admin-ver-motivo-btn"
                          aria-label="Ver comprobante del gasto"
                        >
                          Ver comprobante
                        </a>
                      ) : (
                        <span className="gastos-admin-dash" title="Sin comprobante">—</span>
                      )}
                    </td>
                    <td className="gastos-col-motivo">
                      {g.descripcion ? (
                        <button
                          type="button"
                          className="gastos-ver-motivo-btn gastos-admin-ver-motivo-btn"
                          onClick={() => setMotivoOverlay(g.descripcion)}
                          aria-label="Ver motivo completo del gasto"
                        >
                          Ver motivo
                        </button>
                      ) : (
                        <span className="gastos-admin-dash" title="Sin motivo">—</span>
                      )}
                    </td>
                  </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hayMasGastos && (
              <div className="gastos-admin-mostrar-mas">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleMostrarMas}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Cargando…" : `Mostrar +${proximaCantidad}`}
                </button>
              </div>
            )}
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

      {gastoDetalle !== null && (
        <div className="gastos-motivo-overlay gastos-admin-detalle-overlay" role="dialog" aria-modal="true" aria-label="Detalle del gasto">
          <div className="gastos-motivo-overlay-backdrop" onClick={() => setGastoDetalle(null)} aria-hidden />
          <div className="gastos-motivo-overlay-box gastos-admin-detalle-box">
            <div className="gastos-admin-detalle-header">
              <h4 className="gastos-admin-detalle-title">Detalle del gasto</h4>
              <button
                type="button"
                className="gastos-admin-detalle-close"
                onClick={() => setGastoDetalle(null)}
                aria-label="Cerrar detalle"
              >
                <CloseIcon />
              </button>
            </div>
            <dl className="gastos-admin-detalle-dl">
              <div className="gastos-admin-detalle-row">
                <dt>Nombre</dt>
                <dd>{nombreMostrado(gastoDetalle)}</dd>
              </div>
              <div className="gastos-admin-detalle-row">
                <dt>Fecha</dt>
                <dd>{formatoFechaGastoColombia(gastoDetalle.fecha ?? null)}</dd>
              </div>
              <div className="gastos-admin-detalle-row">
                <dt>Tipo</dt>
                <dd>{tipoLabel(gastoDetalle.tipo ?? "")}</dd>
              </div>
              <div className="gastos-admin-detalle-row">
                <dt>Ámbito</dt>
                <dd>{renderAlcance(gastoDetalle)}</dd>
              </div>
              <div className="gastos-admin-detalle-row">
                <dt>Monto</dt>
                <dd className="gastos-admin-detalle-monto">{formatMoneda(gastoDetalle.monto ?? 0)}</dd>
              </div>
              <div className="gastos-admin-detalle-row">
                <dt>Evidencia</dt>
                <dd>
                  {gastoDetalle.evidencia ? (
                    <a
                      href={gastoDetalle.evidencia}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gastos-ver-motivo-btn gastos-admin-ver-motivo-btn"
                    >
                      Ver comprobante
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="gastos-admin-detalle-row gastos-admin-detalle-row-motivo">
                <dt>Motivo</dt>
                <dd>{gastoDetalle.descripcion || "—"}</dd>
              </div>
            </dl>
            <button type="button" className="btn btn-primary gastos-admin-detalle-cerrar" onClick={() => setGastoDetalle(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {showModalGasto && pendingGastoData && (
        <ModalConfirmar
          titulo="Confirmar gasto"
          labelConfirmar="Sí, registrar gasto"
          confirmando={creating}
          confirmarDeshabilitado={!online}
          confirmacionMarcada={confirmarGastoMarcado}
          onConfirmacionMarcadaChange={setConfirmarGastoMarcado}
          labelConfirmacion={
            <>
              Confirmo el gasto de <strong>{formatMoneda(pendingGastoData.monto)}</strong>
            </>
          }
          onCancelar={() => {
            if (creating) return;
            setShowModalGasto(false);
            setPendingGastoData(null);
            setConfirmarGastoMarcado(false);
          }}
          onConfirmar={() => { void handleEjecutarGasto(pendingGastoData); }}
        >
          <p>Revisa los datos antes de registrar:</p>
          <p>
            Ámbito: <strong>{alcanceGastoLabel(pendingGastoData.alcance)}</strong>
          </p>
          {pendingGastoData.alcance === "ruta" && pendingGastoData.rutaNombre ? (
            <p>
              Ruta: <strong>{pendingGastoData.rutaNombre}</strong>
            </p>
          ) : null}
          <p>
            Tipo: <strong>{tipoLabel(pendingGastoData.tipo)}</strong>
          </p>
          <p>
            Monto: <strong>{formatMoneda(pendingGastoData.monto)}</strong>
          </p>
          <p>
            Motivo: <strong>{pendingGastoData.motivo}</strong>
          </p>
          <p>
            Evidencia: <strong>{pendingGastoData.conEvidencia ? "Con foto adjunta" : "Sin evidencia"}</strong>
          </p>
        </ModalConfirmar>
      )}
    </div>
  );
}
