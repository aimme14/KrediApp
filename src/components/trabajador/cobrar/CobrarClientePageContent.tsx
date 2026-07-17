"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
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
import { getEmpresa } from "@/lib/empresa";
import type { MotivoNoPago, MotivoPerdida } from "@/types/finanzas";
import {
  sanitizeMontoDecimalCOP,
  formatMontoDecimalCOPDisplay,
  interiorDecimalCOPToNumber,
} from "@/lib/monto-input-es";
import { OFFLINE_MSG, useOnline } from "@/hooks/useOnline";
import { labelEstadoPrestamo, normalizeEstadoPrestamo } from "@/lib/prestamo-estado";
import { round2 } from "@/lib/ruta-financiera-compute";
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
} from "@/lib/colombia-day-bounds";
import {
  calcularRitmoFechaFinal,
  formatFechaFinalDisplay,
  labelDiasCobroModo,
} from "@/lib/prestamo-fecha-final";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import {
  clearCobroSnapshot,
  clearNoPagoSnapshot,
  formatCurrencyCobro,
  getCobroSnapshot,
  getNoPagoSnapshot,
  MOTIVOS_NO_PAGO,
  setCobroSnapshot,
  setNoPagoSnapshot,
} from "@/lib/cobrar-utils";

const ModalConfirmar = dynamic(
  () => import("@/components/trabajador/ModalConfirmar").then((m) => ({ default: m.ModalConfirmar })),
  { ssr: false }
);

const CobrarCameraOverlay = dynamic(() => import("@/components/trabajador/CobrarCameraOverlay"), {
  ssr: false,
});

const CobrarComprobanteConfirmacion = dynamic(
  () => import("@/components/trabajador/cobrar/CobrarComprobanteConfirmacion"),
  { ssr: false }
);

const CobrarNoPagoPanel = dynamic(() => import("@/components/trabajador/cobrar/CobrarNoPagoPanel"), {
  ssr: false,
});

const CobrarPerdidaPanel = dynamic(() => import("@/components/trabajador/cobrar/CobrarPerdidaPanel"), {
  ssr: false,
});

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
  const online = useOnline();
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
  const fileInputRef0 = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Texto auxiliar durante envío (subidas en paralelo + API). */
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [showModalCobro, setShowModalCobro] = useState(false);
  const [confirmarCobroMarcado, setConfirmarCobroMarcado] = useState(false);
  const [showModalYaPagoHoy, setShowModalYaPagoHoy] = useState(false);
  const [confirmarYaPagoHoyMarcado, setConfirmarYaPagoHoyMarcado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
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
  const [recoveryChecked, setRecoveryChecked] = useState(false);

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

    const cobroSnap = getCobroSnapshot(prestamoId, user.uid);
    const noPagoSnap = getNoPagoSnapshot(prestamoId, user.uid);

    const tieneCobroSnap = !!cobroSnap?.key && cobroSnap.prestamoId === prestamoId;
    const tieneNoPagoSnap = !!noPagoSnap?.key && noPagoSnap.prestamoId === prestamoId;

    // Sin snapshots pendientes → no hay nada que recuperar
    if (!tieneCobroSnap && !tieneNoPagoSnap) {
      if (cobroSnap) clearCobroSnapshot(prestamoId, user.uid);
      setRecoveryChecked(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();

        if (tieneCobroSnap) {
          // Recovery de cobro
          const result = await checkCobroIdempotency(token, prestamoId, cobroSnap!.key);
          if (cancelled) return;

          if (result.processed && result.payload) {
            clearCobroSnapshot(prestamoId, user.uid);
            const montoRecuperado = result.payload.montoAplicado ?? cobroSnap!.monto;
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
        } else if (tieneNoPagoSnap) {
          // Recovery de no_pago
          const result = await checkCobroIdempotency(token, prestamoId, noPagoSnap!.key);
          if (cancelled) return;

          if (result.processed) {
            clearNoPagoSnapshot(prestamoId, user.uid);
            setNoPagoRegistrado(true);
            void refreshLista();
            void refreshCajaDia();
          } else if (result.failed) {
            clearNoPagoSnapshot(prestamoId, user.uid);
            setError(result.error ?? "El no pago anterior falló. Intenta de nuevo.");
          }
          // result.processing → mantener snapshot; el usuario puede reintentar manualmente
        }
      } catch {
        /* Error de red — mantener snapshots para reintento */
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

  const montoNum = useMemo(() => {
    const n = interiorDecimalCOPToNumber(montoInput);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [montoInput]);

  const saldoPendiente = prestamo?.saldoPendiente ?? 0;
  const montoPrestado = prestamo?.monto ?? 0;
  const montoAplicar = Math.min(montoNum, saldoPendiente);

  const totalAPagar = prestamo?.totalAPagar ?? 0;
  const numeroCuotas = prestamo?.numeroCuotas ?? 0;
  const cuotasPendientes =
    totalAPagar > 0 && numeroCuotas > 0
      ? Math.min(numeroCuotas, Math.ceil((saldoPendiente / totalAPagar) * numeroCuotas))
      : numeroCuotas;
  const valorCuotaFija = numeroCuotas > 0 ? totalAPagar / numeroCuotas : 0;

  const ritmoFechaFinal = useMemo(() => {
    const fechaFinalYmd = prestamo?.fechaFinal ?? null;
    if (!fechaFinalYmd) return null;
    const fechaInicioYmd =
      fechaDiaCalendarioDesdeISO(prestamo?.fechaInicio ?? null) ??
      fechaDiaCalendarioDesdeISO(prestamo?.creadoEn ?? null);
    return calcularRitmoFechaFinal({
      fechaFinalYmd,
      fechaInicioYmd,
      numeroCuotas,
      cuotasPendientes,
      totalAPagar,
      saldoPendiente,
      diasCobroModo: prestamo?.diasCobroModo ?? undefined,
    });
  }, [prestamo, numeroCuotas, cuotasPendientes, totalAPagar, saldoPendiente]);

  /** Atraso por plan de fechas (no por historial de «no pagó»). */
  const cuotasAtrasadas =
    ritmoFechaFinal != null ? ritmoFechaFinal.cuotasAtrasadas : null;

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

  const pagoHoy = useMemo(() => {
    const fechaHoy = fechaDiaColombiaHoy();
    return ultimosPagos.some((p) => {
      if (p.tipo !== "pago" || !p.fecha) return false;
      return fechaDiaCalendarioDesdeISO(p.fecha) === fechaHoy;
    });
  }, [ultimosPagos]);

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

  const handleRevisarCobro = (e: React.FormEvent) => {
    e.preventDefault();
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
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
    setConfirmarCobroMarcado(false);
    if (pagoHoy) {
      setShowModalYaPagoHoy(true);
    } else {
      setShowModalCobro(true);
    }
  };

  const handleEjecutarCobro = async () => {
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
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
      setConfirmarCobroMarcado(false);
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
      // Borrar snapshot al final — si el proceso muere antes de esta línea,
      // el recovery detecta processed:true y reconstruye el comprobante sin reenviar.
      clearCobroSnapshot(prestamoId, user.uid);
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
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
    if (!motivoNoPago || !user || !prestamoId || !profile) return;
    setError(null);
    setShowModalNoPago(true);
  };

  const handleRevisarPerdida = () => {
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
    if (!motivoPerdida || !user || !prestamoId || !profile || !prestamo) return;
    if ((prestamo.saldoPendiente ?? 0) <= 0) {
      setError("No hay saldo pendiente para registrar la pérdida");
      return;
    }
    setError(null);
    setShowModalPerdida(true);
  };

  const handleEjecutarNoPago = async () => {
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
    if (!motivoNoPago || !user || !prestamoId || !profile) return;
    setSubmittingNoPago(true);
    setError(null);

    // Reutiliza key existente (reintento en misma sesión) o genera una nueva
    const noPagoKey = (() => {
      const existing = getNoPagoSnapshot(prestamoId, user.uid);
      if (existing?.prestamoId === prestamoId) return existing.key;
      return crypto.randomUUID();
    })();
    setNoPagoSnapshot({ key: noPagoKey, prestamoId, motivoNoPago }, user.uid);

    try {
      const token = await user.getIdToken();
      const nombreRegistro = profile.displayName ?? profile.email ?? "";
      await registrarNoPago(token, prestamoId, {
        motivoNoPago,
        nota: notaNoPago.trim() || undefined,
        registradoPorUid: user.uid,
        registradoPorNombre: nombreRegistro || undefined,
        idempotencyKey: noPagoKey,
      });
      clearNoPagoSnapshot(prestamoId, user.uid);
      setShowModalNoPago(false);
      setNoPagoRegistrado(true);
      await refreshLista();
      void refreshCajaDia();
    } catch (e) {
      // Snapshot permanece — próximo reintento reutiliza la misma key sin duplicar
      const msg = e instanceof Error ? e.message : "";
      if (
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("NetworkError") ||
        msg.includes("Failed to fetch")
      ) {
        setError("Sin conexión. Puedes reintentar — el no pago no se duplicará.");
      } else {
        setError(msg || "Error al registrar no pago");
      }
    } finally {
      setSubmittingNoPago(false);
    }
  };

  const handleEjecutarPerdida = async () => {
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
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

  if (!profile || (profile.role !== "trabajador" && !isAdminPanelRole(profile.role))) return null;
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
        <p>Verificando operación pendiente...</p>
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
    return (
      <CobrarComprobanteConfirmacion
        cliente={clienteCobro}
        prestamo={prestamoCobro}
        montoCobroConfirmado={montoCobroConfirmado}
        saldoTrasCobro={saldoTrasCobro}
        backHref={backHref}
        backLabel={backLabel}
        renovarPrestamoHref={renovarPrestamoHref}
        empresaNombre={empresaComprobanteMeta.nombre}
        empresaMetaListo={empresaComprobanteMeta.listo}
        error={error}
        onError={setError}
      />
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
    return (
      <CobrarNoPagoPanel
        cliente={cliente}
        motivoNoPago={motivoNoPago}
        notaNoPago={notaNoPago}
        error={error}
        online={online}
        submittingNoPago={submittingNoPago}
        showModalNoPago={showModalNoPago}
        onMotivoChange={setMotivoNoPago}
        onNotaChange={setNotaNoPago}
        onCancelar={() => {
          setShowModalNoPago(false);
          setShowNoPago(false);
        }}
        onRevisar={handleRevisarNoPago}
        onCerrarModal={() => setShowModalNoPago(false)}
        onConfirmar={() => { void handleEjecutarNoPago(); }}
      />
    );
  }

  if (showPerdida && cliente && prestamo) {
    return (
      <CobrarPerdidaPanel
        cliente={cliente}
        prestamo={prestamo}
        motivoPerdida={motivoPerdida}
        notaPerdida={notaPerdida}
        desglosePerdida={desglosePerdida}
        error={error}
        online={online}
        submittingPerdida={submittingPerdida}
        showModalPerdida={showModalPerdida}
        onMotivoChange={setMotivoPerdida}
        onNotaChange={setNotaPerdida}
        onCancelar={() => {
          setShowModalPerdida(false);
          setShowPerdida(false);
        }}
        onRevisar={handleRevisarPerdida}
        onCerrarModal={() => setShowModalPerdida(false)}
        onConfirmar={() => { void handleEjecutarPerdida(); }}
      />
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
          {isAdminPanelRole(profile?.role) && prestamo.saldoPendiente > 0 && (
            <button
              type="button"
              className="btn btn-secondary cobrar-btn-perdida"
              disabled={!online}
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
                  <span className="cobrar-historial-monto">{formatCurrencyCobro(p.monto)}</span>
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
          <span className="cobrar-metrica-value">{formatCurrencyCobro(saldoPendiente)}</span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Monto prestado</span>
          <span className="cobrar-metrica-value">{formatCurrencyCobro(montoPrestado)}</span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Número de cuotas</span>
          <span className="cobrar-metrica-value">{numeroCuotas}</span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Valor de la cuota</span>
          <span className="cobrar-metrica-value">
            {valorCuotaFija > 0 ? formatCurrencyCobro(Math.round(valorCuotaFija)) : "—"}
          </span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Cuotas pendientes</span>
          <span className="cobrar-metrica-value">{cuotasPendientes}</span>
        </div>
        <div className="cobrar-metrica">
          <span className="cobrar-metrica-label">Cuotas atrasadas</span>
          <span className="cobrar-metrica-value">
            {cuotasAtrasadas == null ? "—" : cuotasAtrasadas}
          </span>
        </div>
      </div>

      {ritmoFechaFinal && (
        <div className="cobrar-fecha-final" aria-label="Plazo del préstamo">
          {ritmoFechaFinal.fechaInicioYmd ? (
            <div className="cobrar-fecha-final-row">
              <span className="cobrar-fecha-final-label">Fecha de inicio</span>
              <span className="cobrar-fecha-final-value">
                {formatFechaFinalDisplay(ritmoFechaFinal.fechaInicioYmd)}
              </span>
            </div>
          ) : null}
          <div className="cobrar-fecha-final-row">
            <span className="cobrar-fecha-final-label">Fecha final</span>
            <span className="cobrar-fecha-final-value">
              {formatFechaFinalDisplay(ritmoFechaFinal.fechaFinalYmd)}
            </span>
          </div>
          {prestamo?.diasCobroModo ? (
            <div className="cobrar-fecha-final-row">
              <span className="cobrar-fecha-final-label">Días de cobro</span>
              <span className="cobrar-fecha-final-value">
                {labelDiasCobroModo(prestamo.diasCobroModo)}
              </span>
            </div>
          ) : null}
          <div className="cobrar-fecha-final-row">
            <span className="cobrar-fecha-final-label">Días restantes</span>
            <span
              className={
                ritmoFechaFinal.diasRestantes < 0
                  ? "cobrar-fecha-final-value cobrar-fecha-final-value--vencido"
                  : "cobrar-fecha-final-value"
              }
            >
              {ritmoFechaFinal.diasRestantes < 0
                ? `Venció hace ${Math.abs(ritmoFechaFinal.diasRestantes)} día${
                    Math.abs(ritmoFechaFinal.diasRestantes) === 1 ? "" : "s"
                  }`
                : ritmoFechaFinal.diasRestantes === 0
                  ? "Vence hoy"
                  : `${ritmoFechaFinal.diasRestantes} día${
                      ritmoFechaFinal.diasRestantes === 1 ? "" : "s"
                    }`}
            </span>
          </div>
          {ritmoFechaFinal.ritmo != null && (
            <div className="cobrar-fecha-final-row">
              <span className="cobrar-fecha-final-label">Ritmo de pago</span>
              <span
                className={
                  ritmoFechaFinal.ritmo === "adelantado"
                    ? "cobrar-fecha-final-value cobrar-fecha-final-value--adelantado"
                    : ritmoFechaFinal.ritmo === "al_dia"
                      ? "cobrar-fecha-final-value cobrar-fecha-final-value--aldia"
                      : "cobrar-fecha-final-value cobrar-fecha-final-value--atrasado"
                }
              >
                {ritmoFechaFinal.ritmo === "adelantado"
                  ? "Adelantado"
                  : ritmoFechaFinal.ritmo === "al_dia"
                    ? "Al día"
                    : "Atrasado"}
              </span>
            </div>
          )}
        </div>
      )}

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
          <CobrarCameraOverlay
            slotIndex={cameraSlot}
            onClose={() => setShowCamera(false)}
            onCapture={(file) => {
              setEvidencia(file);
              setShowCamera(false);
            }}
            onCaptureError={(message) => setError(message)}
          />
        )}


        {error && <p className="error-msg">{error}</p>}
        {!online && (
          <p className="error-msg" role="alert">{OFFLINE_MSG}</p>
        )}

        <div className="cobrar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowNoPago(true)}
            disabled={!online}
          >
            No pagó
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!puedeConfirmar || submitting || showModalCobro || showModalYaPagoHoy || !online}
          >
            Confirmar cobro
          </button>
        </div>
      </form>

      {showModalYaPagoHoy && (
        <ModalConfirmar
          titulo="Este cliente ya pagó hoy"
          labelConfirmar="Sí, registrar de todas formas"
          confirmando={false}
          confirmarDeshabilitado={!online}
          confirmacionMarcada={confirmarYaPagoHoyMarcado}
          onConfirmacionMarcadaChange={setConfirmarYaPagoHoyMarcado}
          labelConfirmacion="Confirmo que revisé el historial y deseo registrar otro cobro hoy"
          onCancelar={() => {
            setShowModalYaPagoHoy(false);
            setConfirmarYaPagoHoyMarcado(false);
          }}
          onConfirmar={() => {
            setShowModalYaPagoHoy(false);
            setConfirmarYaPagoHoyMarcado(false);
            setConfirmarCobroMarcado(false);
            setShowModalCobro(true);
          }}
        >
          <p>
            <strong>{cliente?.nombre ?? "Este cliente"}</strong> ya realizó un pago hoy.
            ¿Estás seguro de que quieres registrar otro cobro?
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Verifica el historial antes de continuar para evitar cobros duplicados.
          </p>
        </ModalConfirmar>
      )}

      {showModalCobro && prestamo && clienteCobro && (
        <ModalConfirmar
          titulo="Confirmar cobro"
          labelConfirmar="Sí, registrar cobro"
          confirmando={submitting}
          confirmarDeshabilitado={!online}
          confirmacionMarcada={confirmarCobroMarcado}
          onConfirmacionMarcadaChange={setConfirmarCobroMarcado}
          labelConfirmacion={
            <>
              Confirmo el cobro de <strong>{formatCurrencyCobro(montoAplicar)}</strong> a{" "}
              <strong>{clienteCobro.nombre}</strong>
            </>
          }
          onCancelar={() => {
            if (submitting) return;
            setShowModalCobro(false);
            setConfirmarCobroMarcado(false);
          }}
          onConfirmar={() => { void handleEjecutarCobro(); }}
        >
          <p>Revisa los datos antes de registrar:</p>
          <p>
            Cliente: <strong>{clienteCobro.nombre}</strong>
          </p>
          <p>
            Monto: <strong>{formatCurrencyCobro(montoAplicar)}</strong>
          </p>
          <p>
            Método: <strong>{metodoPago === "efectivo" ? "Efectivo" : "Transferencia"}</strong>
          </p>
          <p>
            Saldo restante tras el cobro:{" "}
            <strong>{formatCurrencyCobro(Math.max(0, saldoPendiente - montoAplicar))}</strong>
          </p>
          <p>
            Evidencia:{" "}
            <strong>
              {evidenciaRequerida
                ? evidenciaFile
                  ? "Con foto adjunta"
                  : "Sin foto (requerida)"
                : "No aplica"}
            </strong>
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
            <strong>{formatCurrencyCobro(saldoPerdidaRegistrada)}</strong>.
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            Se recomienda marcar al cliente como moroso para no volverle a prestar.
          </p>
        </ModalConfirmar>
      )}
    </div>
  );
}

export default CobrarClientePageContent;
