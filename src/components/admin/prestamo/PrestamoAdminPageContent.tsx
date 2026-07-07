"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import {
  createPrestamo,
  formatClienteCodigoRutaYNumero,
  listPeriodosAdmin,
  type ClienteItem,
  type PeriodoAdminListaItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import { formatInteresResumenPct, parseInteresPct } from "@/lib/interes-pct";
import {
  formatDebeSlashTotalCredito,
  fechaRelevantePrestamo,
  calcularDuracionDias,
} from "@/lib/prestamo-display";
import {
  mensajePrestamosVaciosContable,
  numeroPeriodoAdmin,
  periodoAbiertoAdmin,
  resolverRangoFiltroContable,
  type PrestamoFiltroContable,
  type PrestamoFiltroEstado,
} from "@/lib/prestamo-periodo-filter";
import {
  aplicarFiltroNombrePrestamos,
  filtrarPrestamosConConteos,
  prestamoCoincideRuta,
} from "@/lib/prestamo-list-filter";
import { getEmpresa } from "@/lib/empresa";
import { isPrestamoEnCobro, labelEstadoPrestamo } from "@/lib/prestamo-estado";
import { interiorDecimalCOPToNumber } from "@/lib/monto-input-es";
import {
  formatMonedaPrestamoAdmin,
  PRESTAMO_ADMIN_CUOTAS_MAX,
  PRESTAMO_ADMIN_MODALIDADES,
} from "@/lib/prestamo-admin-format";
import { OFFLINE_MSG, useOnline } from "@/hooks/useOnline";
import { isAdminPanelRole } from "@/lib/admin-panel-role";

const ExportPrestamosModal = dynamic(
  () => import("@/components/ExportPrestamosModal").then((m) => ({ default: m.ExportPrestamosModal })),
  { ssr: false }
);

const ModalConfirmar = dynamic(
  () => import("@/components/trabajador/ModalConfirmar").then((m) => ({ default: m.ModalConfirmar })),
  { ssr: false }
);

const PrestamoAdminCreateForm = dynamic(
  () => import("@/components/admin/prestamo/PrestamoAdminCreateForm"),
  { ssr: false }
);

/** Límites de validación para creación de préstamos */
const MONTO_MIN = 1;
const INTERES_MAX = 50;

/** Cuotas ya pagadas (a partir de saldo y total). Para mostrar como "X / total". */
function cuotasPagadas(totalAPagar: number, numeroCuotas: number, saldoPendiente: number): number {
  if (totalAPagar <= 0 || numeroCuotas <= 0) return 0;
  if (saldoPendiente <= 0) return numeroCuotas;
  const cuotaUnit = totalAPagar / numeroCuotas;
  const pagado = totalAPagar - saldoPendiente;
  return Math.min(numeroCuotas, Math.round(pagado / cuotaUnit));
}

/** Orden de prioridad para mostrar préstamo principal: activo > pagado/castigado; luego más reciente primero. */
const ESTADO_ORDEN: Record<string, number> = { activo: 0, pagado: 1, castigado: 1 };

function prestamoEstadoBadgeClass(estado: string): string {
  if (estado === "activo" || estado === "pagado" || estado === "castigado") {
    return ` prestamo-admin-estado--${estado}`;
  }
  return "";
}

function ordenarPrestamosParaPrincipal(prestamos: PrestamoItem[]): PrestamoItem[] {
  return [...prestamos].sort((a, b) => {
    const oa = ESTADO_ORDEN[a.estado] ?? 2;
    const ob = ESTADO_ORDEN[b.estado] ?? 2;
    if (oa !== ob) return oa - ob;
    const ta = new Date(a.fechaInicio || 0).getTime();
    const tb = new Date(b.fechaInicio || 0).getTime();
    return tb - ta; // más reciente primero
  });
}

type GrupoClientePrestamos = { clienteId: string; prestamos: PrestamoItem[] };

function tituloColumnaMetrica(filtroEstado: PrestamoFiltroEstado): string {
  if (filtroEstado === "castigado") return "Capital perdido";
  return "Cuotas";
}

function mostrarColumnaMetrica(filtroEstado: PrestamoFiltroEstado): boolean {
  return filtroEstado !== "pagado";
}

function numColumnasTablaPrestamo(filtroEstado: PrestamoFiltroEstado): number {
  if (filtroEstado === "pagado") return 9;
  if (filtroEstado === "castigado") return 10;
  return 11;
}

function tituloColumnaSaldo(filtroEstado: PrestamoFiltroEstado): string {
  if (filtroEstado === "castigado") return "Cobrado";
  if (filtroEstado === "pagado") return "Total Pagado";
  return "Saldo";
}

function celdaSaldoOCobrado(
  p: PrestamoItem,
  filtroEstado: PrestamoFiltroEstado
): ReactNode {
  if (filtroEstado === "castigado") {
    return (
      <span
        style={{ color: "var(--success, #16a34a)", fontWeight: 600 }}
        title="Cobro bruto acumulado antes del castigo"
      >
        $ {formatMonedaPrestamoAdmin(p.cobradoAcumulado ?? 0)}
      </span>
    );
  }
  if (filtroEstado === "pagado") {
    return formatMonedaPrestamoAdmin(p.totalAPagar);
  }
  if (p.estado === "castigado") {
    return (
      <span
        style={{ color: "var(--success, #16a34a)", fontWeight: 600 }}
        title="Cobro bruto acumulado"
      >
        $ {formatMonedaPrestamoAdmin(p.cobradoAcumulado ?? 0)}
      </span>
    );
  }
  if (p.estado === "pagado") {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  return formatMonedaPrestamoAdmin(p.saldoPendiente);
}

function celdaMetrica(
  p: PrestamoItem,
  filtroEstado: PrestamoFiltroEstado,
  pagadas: number
): ReactNode {
  if (filtroEstado === "castigado") {
    return (
      <span
        style={{ color: "var(--danger, #dc2626)", fontWeight: 600 }}
        title="Capital no recuperado"
      >
        −$ {formatMonedaPrestamoAdmin(p.totalCastigado ?? 0)}
      </span>
    );
  }
  if (p.estado === "castigado") {
    return (
      <span
        style={{ color: "var(--danger, #dc2626)", fontWeight: 600 }}
        title="Capital no recuperado"
      >
        −$ {formatMonedaPrestamoAdmin(p.totalCastigado ?? 0)}
      </span>
    );
  }
  if (p.estado === "pagado") {
    return (
      <span
        style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}
        title="Duración del crédito"
      >
        {calcularDuracionDias(p.fechaInicio, p.fechaCierre)}
      </span>
    );
  }
  return `${pagadas} / ${p.numeroCuotas}`;
}

export default function PrestamoAdminPageContent() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const { rutas } = useAdminDashboard();
  const {
    clientes,
    prestamos,
    prestamosPagados,
    loadingPagados,
    hayMasPagados,
    cargarMasPagados,
    cargarTodosPagados,
    prestamosCastigados,
    loadingCastigados,
    hayMasCastigados,
    cargarMasCastigados,
    loading,
    error: listaError,
    refresh,
  } = useTrabajadorLista();
  const online = useOnline();
  const [error, setError] = useState<string | null>(null);
  const [rutaIdForm, setRutaIdForm] = useState("");
  const rutaSeleccionada = rutas.find((r) => r.id === rutaIdForm);
  const cajaRuta = rutaSeleccionada?.cajaRuta ?? 0;
  const MONTO_MAX = cajaRuta > 0 ? cajaRuta : 50_000_000;
  const MONTO_CONFIRMAR_ALTO = 1_000_000;
  const [clienteId, setClienteId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [modalidad, setModalidad] = useState<"diario" | "semanal" | "mensual">("mensual");
  const [numeroCuotas, setNumeroCuotas] = useState("");
  const [interes, setInteres] = useState("");
  const [monto, setMonto] = useState("");
  const [creating, setCreating] = useState(false);
  const [showModalPrestamo, setShowModalPrestamo] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [nombreEmpresa, setNombreEmpresa] = useState("KrediApp");
  const [confirmarMontoAlto, setConfirmarMontoAlto] = useState(false);
  const [filtroContable, setFiltroContable] = useState<PrestamoFiltroContable>({ modo: "todo" });
  const [filtroEstado, setFiltroEstado] = useState<PrestamoFiltroEstado>("activo");
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroRutaId, setFiltroRutaId] = useState("");
  const [periodos, setPeriodos] = useState<PeriodoAdminListaItem[]>([]);
  const [periodosLoading, setPeriodosLoading] = useState(true);
  const [historialEconomicoColapsado, setHistorialEconomicoColapsado] = useState(true);
  /** Clave de idempotencia para el intento de creación actual — persiste entre reintentos en la misma sesión de formulario. */
  const prestamoCreateKeyRef = useRef<string | null>(null);
  /** Checkbox de confirmación dentro del modal de creación (separado de confirmarMontoAlto del formulario). */
  const [confirmarModalPrestamo, setConfirmarModalPrestamo] = useState(false);

  useEffect(() => {
    setConfirmarMontoAlto(false);
  }, [rutaIdForm, clienteId, monto, numeroCuotas, interes, modalidad]);

  const abrirFormularioCrear = useCallback(() => {
    // Nueva key por cada intento de creación; retiros en la misma sesión reusan la misma key
    prestamoCreateKeyRef.current = crypto.randomUUID();
    setConfirmarMontoAlto(false);
    setConfirmarModalPrestamo(false);
    setShowModalPrestamo(false);
    setError(null);
    setShowCreateForm(true);
  }, []);

  const cerrarFormularioCrear = useCallback(() => {
    prestamoCreateKeyRef.current = null;
    setShowCreateForm(false);
  }, []);

  useEffect(() => {
    setHistorialEconomicoColapsado(true);
  }, [clienteId]);

  useEffect(() => {
    setClienteId("");
  }, [rutaIdForm]);

  useEffect(() => {
    const id = searchParams.get("clienteId")?.trim();
    if (!id || loading) return;
    const cl = clientes.find((c) => c.id === id);
    if (!cl) return;
    setRutaIdForm(cl.rutaId ?? "");
  }, [searchParams, clientes, loading]);

  useEffect(() => {
    const id = searchParams.get("clienteId")?.trim();
    if (!id || loading) return;
    const cl = clientes.find((c) => c.id === id);
    if (!cl || (cl.rutaId ?? "") !== rutaIdForm) return;
    setClienteId(id);
    setConfirmarMontoAlto(false);
    setShowModalPrestamo(false);
    setShowCreateForm(true);
  }, [searchParams, clientes, loading, rutaIdForm]);

  const loadPeriodos = useCallback(() => {
    if (!user) return;
    setPeriodosLoading(true);
    user.getIdToken().then((token) => {
      listPeriodosAdmin(token)
        .then(setPeriodos)
        .catch(() => setPeriodos([]))
        .finally(() => setPeriodosLoading(false));
    });
  }, [user]);

  useEffect(() => {
    loadPeriodos();
  }, [loadPeriodos]);

  useEffect(() => {
    if (!profile?.empresaId) return;
    getEmpresa(profile.empresaId)
      .then((e) => {
        if (e?.nombre?.trim()) setNombreEmpresa(e.nombre.trim());
      })
      .catch(() => {});
  }, [profile?.empresaId]);

  useEffect(() => {
    if (filtroEstado !== "pagado" && filtroEstado !== "castigado" && filtroEstado !== "todos") {
      return;
    }
    if (filtroEstado === "pagado" || filtroEstado === "todos") {
      if (
        !loadingPagados &&
        hayMasPagados &&
        !(filtroEstado === "pagado" && prestamosPagados.length > 0)
      ) {
        void cargarMasPagados();
      }
    }
  }, [
    filtroEstado,
    loadingPagados,
    hayMasPagados,
    prestamosPagados.length,
    cargarMasPagados,
  ]);

  const handleSubmit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
    if (!user) return;
    const montoNum = interiorDecimalCOPToNumber(monto);
    const nCuotas = Math.max(1, parseInt(numeroCuotas, 10) || 1);
    const iVal = parseInteresPct(interes);

    if (isNaN(montoNum) || montoNum < MONTO_MIN) {
      setError(`El monto debe ser al menos ${formatMonedaPrestamoAdmin(MONTO_MIN)}`);
      return;
    }
    if (cajaRuta > 0 && montoNum > cajaRuta) {
      setError("El monto supera la base disponible");
      return;
    }
    if (montoNum > MONTO_MAX) {
      setError(`El monto no puede superar ${formatMonedaPrestamoAdmin(MONTO_MAX)}`);
      return;
    }
    if (nCuotas > PRESTAMO_ADMIN_CUOTAS_MAX) {
      setError(`El número de cuotas no puede superar ${PRESTAMO_ADMIN_CUOTAS_MAX}`);
      return;
    }
    if (iVal < 0 || iVal > INTERES_MAX) {
      setError(`El interés debe estar entre 0 y ${INTERES_MAX}%`);
      return;
    }
    if (!confirmarMontoAlto) {
      setError(
        montoNum >= MONTO_CONFIRMAR_ALTO
          ? `Confirma que deseas crear un préstamo de ${formatMonedaPrestamoAdmin(montoNum)} marcando la casilla`
          : "Marca la casilla «Confirmo» para continuar"
      );
      return;
    }
    if (!rutaIdForm.trim()) {
      setError("Selecciona una ruta");
      return;
    }
    if (!clienteId.trim()) {
      setError("Selecciona un cliente");
      return;
    }
    setConfirmarModalPrestamo(false);
    setError(null);
    setShowModalPrestamo(true);
  };

  const handleEjecutarPrestamo = async () => {
    // Guard doble-clic: el modal deshabilita el botón, pero previene race conditions en el primer frame
    if (creating) return;
    if (!online) {
      setError(OFFLINE_MSG);
      return;
    }
    if (!user || !confirmarMontoAlto) return;
    const montoNum = interiorDecimalCOPToNumber(monto);
    const nCuotas = Math.max(1, parseInt(numeroCuotas, 10) || 1);

    // Reutiliza key del intento actual (si red cayó y el usuario reintenta, el backend deduplica)
    const idempotencyKey = prestamoCreateKeyRef.current ?? crypto.randomUUID();
    prestamoCreateKeyRef.current = idempotencyKey;

    setError(null);
    setCreating(true);
    try {
      const token = await user.getIdToken();
      await createPrestamo(token, {
        clienteId: clienteId.trim(),
        monto: montoNum,
        interes: parseInteresPct(interes),
        modalidad,
        numeroCuotas: nCuotas,
        fechaInicio: new Date().toISOString().slice(0, 10),
        idempotencyKey,
      });
      prestamoCreateKeyRef.current = null;
      setRutaIdForm("");
      setClienteId("");
      setMonto("");
      setNumeroCuotas("");
      setInteres("");
      setModalidad("mensual");
      setConfirmarMontoAlto(false);
      setConfirmarModalPrestamo(false);
      setShowModalPrestamo(false);
      setShowCreateForm(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear préstamo");
    } finally {
      setCreating(false);
    }
  };

  const clientesSinPrestamo = clientes.filter((c) => !c.prestamo_activo && !c.moroso);
  const clientesDeRuta = rutaIdForm ? clientes.filter((c) => c.rutaId === rutaIdForm) : [];
  const clientesSinPrestamoDeRuta = clientesSinPrestamo.filter((c) => c.rutaId === rutaIdForm);

  const opcionesClientePrestamo = useMemo(
    () =>
      clientesSinPrestamoDeRuta.map((c) => {
        const codigoPart = c.codigo ? `${formatClienteCodigoRutaYNumero(c.codigo)} · ` : "";
        const cedulaPart = c.cedula ? ` · ${c.cedula}` : "";
        return {
          value: c.id,
          label: `${codigoPart}${c.nombre}${cedulaPart}`,
          searchText: [
            c.nombre,
            c.codigo,
            formatClienteCodigoRutaYNumero(c.codigo),
            c.cedula,
          ]
            .filter(Boolean)
            .join(" "),
        };
      }),
    [clientesSinPrestamoDeRuta]
  );

  const hintClientePrestamo = useMemo(() => {
    if (!rutaIdForm) return undefined;
    if (clientesDeRuta.length === 0) return "No hay clientes en esta ruta";
    if (clientesSinPrestamoDeRuta.length === 0) {
      return "Todos los clientes de esta ruta tienen préstamo activo o están marcados como morosos";
    }
    return undefined;
  }, [rutaIdForm, clientesDeRuta.length, clientesSinPrestamoDeRuta.length]);
  const clientePorId = useMemo(() => {
    const m: Record<string, ClienteItem> = {};
    clientes.forEach((c) => { m[c.id] = c; });
    return m;
  }, [clientes]);
  const clienteSeleccionado = clienteId ? clientePorId[clienteId] : null;
  const montoNum = interiorDecimalCOPToNumber(monto);
  const nCuotasVal = parseInt(numeroCuotas, 10) || 0;
  const iVal = parseInteresPct(interes);
  const totalAPagar = !isNaN(montoNum) && montoNum > 0 && nCuotasVal >= 1
    ? montoNum * (1 + iVal / 100)
    : 0;
  const cuotaPorPago = totalAPagar > 0 && nCuotasVal >= 1 ? totalAPagar / nCuotasVal : 0;
  const requiereConfirmarMonto = !isNaN(montoNum) && montoNum >= MONTO_CONFIRMAR_ALTO;
  const modalidadLabel =
    PRESTAMO_ADMIN_MODALIDADES.find((m) => m.value === modalidad)?.label ?? modalidad;

  const resumenPrestamos = useMemo(() => {
    const activos = prestamos.filter(
      (p) => p.estado === "activo" && prestamoCoincideRuta(p, filtroRutaId, clientePorId)
    );
    return {
      activos: activos.length,
      saldoPorRecoger: activos.reduce((sum, p) => sum + (p.saldoPendiente ?? 0), 0),
    };
  }, [prestamos, filtroRutaId, clientePorId]);

  const periodoAbierto = useMemo(() => periodoAbiertoAdmin(periodos), [periodos]);

  const rangoContable = useMemo(
    () => resolverRangoFiltroContable(filtroContable, periodos),
    [filtroContable, periodos]
  );

  /**
   * Pase único sobre la colección: fusiona, deduplica, aplica filtroContable +
   * filtroRutaId + filtroEstado, y clasifica conteos en un solo bucle.
   * NO depende de filtroNombre para que el buscador no relance esta operación
   * en cada tecla — ver memo de prestamosFiltrados abajo.
   */
  const { listaEstado, conteos: contadoresPorFiltro } = useMemo(
    () =>
      filtrarPrestamosConConteos({
        prestamos,
        prestamosPagados,
        prestamosCastigados,
        filtroContable,
        filtroEstado,
        filtroRutaId,
        clientePorId,
        periodos,
      }),
    [
      prestamos,
      prestamosPagados,
      prestamosCastigados,
      filtroContable,
      filtroEstado,
      filtroRutaId,
      clientePorId,
      periodos,
    ]
  );

  /** Aplica el buscador sobre la lista ya filtrada por estado. */
  const prestamosFiltrados = useMemo(
    () => aplicarFiltroNombrePrestamos(listaEstado, filtroNombre, clientePorId),
    [listaEstado, filtroNombre, clientePorId]
  );

  const formatContadorFiltro = (est: PrestamoFiltroEstado) => {
    const n = contadoresPorFiltro[est];
    const masPendiente = hayMasPagados && (est === "pagado" || est === "todos");
    return masPendiente ? `${n}+` : String(n);
  };

  const FILTROS_PRESTAMO: { est: PrestamoFiltroEstado; label: string }[] = [
    { est: "todos", label: "Todos" },
    { est: "activo", label: "Activos" },
    { est: "pagado", label: "Pagados" },
    { est: "castigado", label: "Pérdidas" },
    { est: "moroso", label: "Morosos" },
  ];

  const filtroNombreLower = filtroNombre.trim().toLowerCase();

  const resumenPerdidas = useMemo(() => {
    const castigados = prestamosFiltrados.filter((p) => p.estado === "castigado");
    return {
      cantidad: castigados.length,
      totalPerdido: castigados.reduce((sum, p) => sum + (p.totalCastigado ?? 0), 0),
    };
  }, [prestamosFiltrados]);

  const PAGE_SIZE = 15;
  const [pagina, setPagina] = useState(1);
  const [ordenDesc, setOrdenDesc] = useState(true);

  useEffect(() => {
    setPagina(1);
  }, [filtroEstado, filtroContable, filtroNombre, filtroRutaId, ordenDesc]);

  /** Grupos por cliente: principal = reciente y activo (activo > pagado, luego por fecha). */
  const gruposPorCliente = useMemo((): GrupoClientePrestamos[] => {
    const byCliente = new Map<string, PrestamoItem[]>();
    for (const p of prestamosFiltrados) {
      const list = byCliente.get(p.clienteId) ?? [];
      list.push(p);
      byCliente.set(p.clienteId, list);
    }
    const grupos: GrupoClientePrestamos[] = [];
    byCliente.forEach((lista, clienteId) => {
      const ordenados = ordenarPrestamosParaPrincipal(lista);
      grupos.push({ clienteId, prestamos: ordenados });
    });
    grupos.sort((a, b) => {
      const pa = a.prestamos[0];
      const pb = b.prestamos[0];
      const oa = ESTADO_ORDEN[pa.estado] ?? 2;
      const ob = ESTADO_ORDEN[pb.estado] ?? 2;
      if (oa !== ob) return oa - ob;
      const ta = new Date(pa.fechaInicio || 0).getTime();
      const tb = new Date(pb.fechaInicio || 0).getTime();
      return ordenDesc ? tb - ta : ta - tb;
    });
    return grupos;
  }, [prestamosFiltrados, ordenDesc]);

  const gruposPaginados = useMemo(() => {
    return gruposPorCliente.slice(0, pagina * PAGE_SIZE);
  }, [gruposPorCliente, pagina]);

  const hayMas = gruposPaginados.length < gruposPorCliente.length;

  const [clientesExpandidos, setClientesExpandidos] = useState<Set<string>>(() => new Set());
  const toggleExpandirCliente = useCallback((clienteId: string) => {
    setClientesExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(clienteId)) next.delete(clienteId);
      else next.add(clienteId);
      return next;
    });
  }, []);

  const prestamosDelCliente = useMemo(() => {
    if (!clienteId) return [];
    const ids = new Set<string>();
    const merged: PrestamoItem[] = [];
    for (const p of [...prestamos, ...prestamosPagados, ...prestamosCastigados]) {
      if (p.clienteId !== clienteId || ids.has(p.id)) continue;
      ids.add(p.id);
      merged.push(p);
    }
    return ordenarPrestamosParaPrincipal(merged);
  }, [prestamos, prestamosPagados, prestamosCastigados, clienteId]);

  if (!profile || !isAdminPanelRole(profile.role)) return null;

  const bannerPeriodo = (() => {
    if (filtroContable.modo === "hoy") {
      return {
        tone: "neutral" as const,
        titulo: "Desembolsados hoy",
        detalle: "",
      };
    }
    if (filtroContable.modo === "todo") {
      return {
        tone: "neutral" as const,
        titulo: "Todo el historial",
        detalle: "",
      };
    }
    if (filtroContable.modo === "actual" && !periodoAbierto) {
      return {
        tone: "warn" as const,
        titulo: "Sin periodo abierto",
        detalle:
          "",
      };
    }
    if (!rangoContable?.periodo) {
      return {
        tone: "warn" as const,
        titulo: "Periodo no disponible",
        detalle: "",
      };
    }
    const num =
      rangoContable.numeroPeriodo ?? numeroPeriodoAdmin(rangoContable.periodo.id, periodos);
    if (rangoContable.periodo.estado === "abierto") {
      return {
        tone: "active" as const,
        titulo: `Período #${num ?? "—"} · Abierto — desembolsados en este corte`,
        detalle: "",
      };
    }
    return {
      tone: "neutral" as const,
      titulo: `Período #${num ?? "—"} · Cerrado — desembolsados en este corte`,
      detalle: "",
    };
  })();

  return (
    <div className="card prestamo-admin-page">
      {showCreateForm && (
        <PrestamoAdminCreateForm
          rutas={rutas}
          rutaIdForm={rutaIdForm}
          onRutaIdFormChange={setRutaIdForm}
          clienteId={clienteId}
          onClienteIdChange={setClienteId}
          opcionesClientePrestamo={opcionesClientePrestamo}
          hintClientePrestamo={hintClientePrestamo}
          clienteSeleccionado={clienteSeleccionado}
          monto={monto}
          onMontoChange={setMonto}
          cajaRuta={cajaRuta}
          historialEconomicoColapsado={historialEconomicoColapsado}
          onHistorialEconomicoColapsadoToggle={() => setHistorialEconomicoColapsado((v) => !v)}
          loading={loading}
          prestamosDelCliente={prestamosDelCliente}
          modalidad={modalidad}
          onModalidadChange={setModalidad}
          numeroCuotas={numeroCuotas}
          onNumeroCuotasChange={setNumeroCuotas}
          interes={interes}
          onInteresChange={setInteres}
          montoNum={montoNum}
          nCuotasVal={nCuotasVal}
          iVal={iVal}
          totalAPagar={totalAPagar}
          cuotaPorPago={cuotaPorPago}
          error={error}
          listaError={listaError}
          confirmarMontoAlto={confirmarMontoAlto}
          onConfirmarMontoAltoChange={setConfirmarMontoAlto}
          requiereConfirmarMonto={requiereConfirmarMonto}
          creating={creating}
          online={online}
          onSubmit={() => handleSubmit()}
          onClose={cerrarFormularioCrear}
        />
      )}

      {!showCreateForm && (
      <>
        {!loading && (
          <div className="prestamo-admin-resumen-block">
            <div className="prestamo-admin-resumen-head">
              <div className="admin-clientes-filtro-ruta prestamo-admin-filtro-ruta">
                <label htmlFor="prestamos-filtro-ruta" className="admin-clientes-filtro-ruta-label">
                  Ruta
                </label>
                <select
                  id="prestamos-filtro-ruta"
                  className="admin-clientes-filtro-ruta-select"
                  value={filtroRutaId}
                  onChange={(e) => setFiltroRutaId(e.target.value)}
                  aria-label="Filtrar préstamos y saldo por ruta"
                >
                  <option value="">Todas las rutas</option>
                  {rutas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                      {r.ubicacion ? ` · ${r.ubicacion}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="prestamo-admin-resumen">
            <div className="prestamo-admin-kpi">
              <div className="prestamo-admin-kpi-body">
                <span className="prestamo-admin-kpi-label">Activos</span>
                <span className="prestamo-admin-kpi-value">{resumenPrestamos.activos}</span>
              </div>
              <span className="prestamo-admin-kpi-icon prestamo-admin-kpi-icon--activo" aria-hidden>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
            </div>
            <div className="prestamo-admin-kpi">
              <div className="prestamo-admin-kpi-body">
                <span className="prestamo-admin-kpi-label">Saldo por recoger</span>
                <span className="prestamo-admin-kpi-value">$ {formatMonedaPrestamoAdmin(resumenPrestamos.saldoPorRecoger)}</span>
              </div>
              <span className="prestamo-admin-kpi-icon prestamo-admin-kpi-icon--recoger" aria-hidden>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </span>
            </div>
            {filtroEstado === "castigado" && (
              <div className="prestamo-admin-kpi">
                <div className="prestamo-admin-kpi-body">
                  <span className="prestamo-admin-kpi-label">Capital perdido</span>
                  <span className="prestamo-admin-kpi-value" style={{ color: "var(--danger, #dc2626)" }}>
                    −$ {formatMonedaPrestamoAdmin(resumenPerdidas.totalPerdido)}
                  </span>
                </div>
                <span className="prestamo-admin-kpi-icon" style={{ color: "var(--danger, #dc2626)" }} aria-hidden>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </span>
              </div>
            )}
            </div>
          </div>
        )}
        <div className={`card prestamo-admin-hist-card${filtroEstado === "moroso" ? " prestamo-admin-hist-card--moroso" : ""}`}>
        <div className="prestamo-admin-hist-head">
          <h3 className="prestamo-admin-hist-title">Historial de préstamos</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.8125rem" }}
              onClick={() => setShowExportModal(true)}
              title="Descargar préstamos"
              aria-label="Descargar préstamos"
            >
              Descargar
            </button>
            <button
              type="button"
              className="prestamo-admin-add-btn"
              onClick={abrirFormularioCrear}
              aria-label="Crear nuevo préstamo"
              title="Crear nuevo préstamo"
            >
              +
            </button>
          </div>
        </div>
        {loading ? (
          <p className="prestamo-admin-loading">Cargando…</p>
        ) : prestamos.length === 0 &&
          prestamosPagados.length === 0 &&
          prestamosCastigados.length === 0 &&
          !loadingPagados &&
          !loadingCastigados &&
          filtroEstado !== "pagado" &&
          filtroEstado !== "castigado" &&
          filtroContable.modo === "todo" ? (
          <p className="prestamo-admin-empty">No hay préstamos en el historial.</p>
        ) : (
          <>
            <div className="prestamo-admin-filtros-wrap">
              <div className="prestamo-admin-filtro-estado-section">
                <p id="prestamo-filtro-estado-label" className="prestamo-admin-filtro-legend">
                  Estado
                </p>
                <div
                  className="prestamo-admin-tabs prestamo-historial-filtros prestamo-admin-historial-filtros-row"
                  role="tablist"
                  aria-labelledby="prestamo-filtro-estado-label"
                >
                {FILTROS_PRESTAMO.map(({ est, label }) => (
                  <Fragment key={est}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filtroEstado === est && filtroContable.modo !== "hoy"}
                      className={`prestamo-admin-tab${filtroEstado === est && filtroContable.modo !== "hoy" ? " prestamo-admin-tab--active" : ""}`}
                      onClick={() => { setFiltroContable({ modo: "todo" }); setFiltroEstado(est); }}
                      aria-label={`${label}, ${contadoresPorFiltro[est]} préstamo${contadoresPorFiltro[est] !== 1 ? "s" : ""}`}
                    >
                      {label}
                      <span className="prestamo-admin-tab-count">({formatContadorFiltro(est)})</span>
                    </button>
                    {est === "activo" && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={filtroContable.modo === "hoy"}
                        className={`prestamo-admin-tab${filtroContable.modo === "hoy" ? " prestamo-admin-tab--active" : ""}`}
                        onClick={() => { setFiltroContable({ modo: "hoy" }); setFiltroEstado("todos"); }}
                        aria-label="Desembolsados hoy"
                      >
                        Hoy
                      </button>
                    )}
                  </Fragment>
                ))}
                </div>
              </div>

              <div className="prestamo-admin-search-toolbar">
                <div className="prestamo-admin-search-field">
                  <span className="prestamo-admin-search-icon" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </span>
                  <input
                    id="prestamos-buscador"
                    className="prestamo-admin-search-input"
                    type="search"
                    value={filtroNombre}
                    onChange={(e) => setFiltroNombre(e.target.value)}
                    placeholder="Buscar por nombre, código o cédula..."
                    aria-label="Buscar préstamos por nombre de cliente"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}
                  onClick={() => setOrdenDesc((v) => !v)}
                  title={ordenDesc ? "Ordenar: más antiguos primero" : "Ordenar: más recientes primero"}
                >
                  {ordenDesc ? "↓ Más recientes" : "↑ Más antiguos"}
                </button>
                {filtroNombreLower ? (
                  <p className="prestamo-admin-search-hint">
                    {gruposPorCliente.length} cliente{gruposPorCliente.length !== 1 ? "s" : ""} encontrado{gruposPorCliente.length !== 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="table-wrap table-historial-wrap prestamo-admin-hist-table-wrap">
            <table className="table-historial">
              <thead>
                <tr>
                  <th aria-label="Expandir historial" />
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>
                    {filtroEstado === "pagado"
                      ? "Fecha pago"
                      : filtroEstado === "castigado"
                        ? "Fecha pérdida"
                        : "Fecha"}
                  </th>
                  <th className="col-num">
                    <span className="prestamo-admin-monto-th-desktop">Monto</span>
                    <span className="prestamo-admin-monto-th-mobile">Debe</span>
                  </th>
                  {filtroEstado !== "pagado" && filtroEstado !== "castigado" && (
                    <th className="col-num">Total a pagar</th>
                  )}
                  <th className="col-num">{tituloColumnaSaldo(filtroEstado)}</th>
                  {mostrarColumnaMetrica(filtroEstado) && (
                    <th className="col-num">{tituloColumnaMetrica(filtroEstado)}</th>
                  )}
                  <th>Estado</th>
                  <th>Frecuencia</th>
                  <th>
                    <span className="prestamo-admin-cobro-th-desktop">Acción</span>
                    <span className="prestamo-admin-cobro-th-mobile" aria-hidden>
                      Cobrar
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {gruposPaginados.map((grupo) => {
                  const principal = grupo.prestamos[0];
                  const cl = clientePorId[grupo.clienteId];
                  const nombre = cl?.nombre ?? grupo.clienteId;
                  const codigoDisplay = cl?.codigo ? formatClienteCodigoRutaYNumero(cl.codigo) : "—";
                  const pagadas = cuotasPagadas(principal.totalAPagar, principal.numeroCuotas, principal.saldoPendiente);
                  const tieneMas = grupo.prestamos.length > 1;
                  const expandido = clientesExpandidos.has(grupo.clienteId);
                  const otros = grupo.prestamos.slice(1);
                  return (
                    <Fragment key={grupo.clienteId}>
                      <tr>
                        <td>
                          {tieneMas ? (
                            <button
                              type="button"
                              className="btn-expand-historial"
                              onClick={() => toggleExpandirCliente(grupo.clienteId)}
                              aria-expanded={expandido}
                              aria-controls={`historial-cliente-${grupo.clienteId}`}
                              id={`btn-expand-${grupo.clienteId}`}
                              title={expandido ? "Ocultar otros préstamos" : `Ver ${otros.length} préstamo(s) más`}
                            >
                              {expandido ? "−" : `+${otros.length}`}
                            </button>
                          ) : (
                            <span aria-hidden style={{ display: "inline-block", width: "1.5rem", minHeight: "1.25rem" }} />
                          )}
                        </td>
                        <td className="prestamo-admin-col-codigo">{codigoDisplay}</td>
                        <td className="prestamo-admin-col-cliente" title={nombre}>
                          {nombre}
                        </td>
                        <td
                          className="prestamo-histo-col-fecha"
                          title={
                            principal.estado === "pagado" || principal.estado === "castigado"
                              ? "Fecha de cierre"
                              : "Fecha de creación"
                          }
                        >
                          {fechaRelevantePrestamo(principal)}
                        </td>
                        <td className="col-num">
                          <span className="prestamo-admin-monto-desktop">{formatMonedaPrestamoAdmin(principal.monto)}</span>
                          <span className="prestamo-admin-monto-mobile">
                            {formatDebeSlashTotalCredito(principal.saldoPendiente, principal)}
                          </span>
                        </td>
                        {filtroEstado !== "pagado" && filtroEstado !== "castigado" && (
                          <td className="col-num">{formatMonedaPrestamoAdmin(principal.totalAPagar)}</td>
                        )}
                        <td className="col-num">{celdaSaldoOCobrado(principal, filtroEstado)}</td>
                        {mostrarColumnaMetrica(filtroEstado) && (
                          <td
                            className="col-num"
                            title={
                              filtroEstado === "castigado" || principal.estado === "castigado"
                                ? "Capital no recuperado"
                                : principal.estado === "pagado"
                                  ? "Duración del crédito"
                                  : "Cuotas pagadas / total"
                            }
                          >
                            {celdaMetrica(principal, filtroEstado, pagadas)}
                          </td>
                        )}
                        <td>
                          <span
                            className={`prestamo-admin-estado${prestamoEstadoBadgeClass(principal.estado)}`}
                          >
                            {labelEstadoPrestamo(principal)}
                          </span>
                        </td>
                        <td>{principal.modalidad}</td>
                        <td className="prestamo-admin-cobro-cell">
                          {isPrestamoEnCobro(principal) && (
                            <Link
                              href={`/dashboard/admin/cobrar?clienteId=${grupo.clienteId}&prestamoId=${principal.id}`}
                              className="btn btn-primary prestamo-admin-cobro-btn"
                            >
                              <span className="prestamo-admin-cobro-label-desktop">Registrar cobro</span>
                              <span className="prestamo-admin-cobro-label-mobile">Cobrar</span>
                            </Link>
                          )}
                        </td>
                      </tr>
                      {tieneMas && expandido && (
                        <>
                          <tr
                            className="prestamo-admin-expand-header-row"
                            aria-labelledby={`btn-expand-${grupo.clienteId}`}
                          >
                            <td aria-hidden />
                            <td colSpan={2} className="prestamo-admin-expand-title-cell">
                              <span className="prestamo-admin-expand-title">Otros préstamos</span>
                            </td>
                            <td
                              colSpan={numColumnasTablaPrestamo(filtroEstado) - 3}
                              aria-hidden
                              className="prestamo-admin-expand-empty"
                            />
                          </tr>
                          {otros.map((p) => {
                            const pagadasP = cuotasPagadas(
                              p.totalAPagar,
                              p.numeroCuotas,
                              p.saldoPendiente
                            );
                            return (
                              <tr key={p.id} className="prestamo-admin-expand-row">
                                <td aria-hidden className="prestamo-admin-expand-empty" />
                                <td aria-hidden className="prestamo-admin-expand-empty" />
                                <td aria-hidden className="prestamo-admin-expand-empty" />
                                <td className="prestamo-histo-col-fecha">
                                  {fechaRelevantePrestamo(p)}
                                </td>
                                <td className="col-num">{formatMonedaPrestamoAdmin(p.monto)}</td>
                                {filtroEstado !== "pagado" && filtroEstado !== "castigado" && (
                                  <td className="col-num">{formatMonedaPrestamoAdmin(p.totalAPagar)}</td>
                                )}
                                <td className="col-num">{celdaSaldoOCobrado(p, filtroEstado)}</td>
                                {mostrarColumnaMetrica(filtroEstado) && (
                                  <td className="col-num">{celdaMetrica(p, filtroEstado, pagadasP)}</td>
                                )}
                                <td>
                                  <span
                                    className={`prestamo-admin-estado${prestamoEstadoBadgeClass(p.estado)}`}
                                  >
                                    {labelEstadoPrestamo(p)}
                                  </span>
                                </td>
                                <td className="prestamo-admin-expand-empty">{p.modalidad}</td>
                                <td className="prestamo-admin-cobro-cell">
                                  {isPrestamoEnCobro(p) && (
                                    <Link
                                      href={`/dashboard/admin/cobrar?clienteId=${grupo.clienteId}&prestamoId=${p.id}`}
                                      className="btn btn-primary prestamo-admin-cobro-btn prestamo-admin-cobro-btn--sm"
                                    >
                                      Cobrar
                                    </Link>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(hayMas || hayMasPagados || hayMasCastigados) && (
            <div
              style={{
                textAlign: "center",
                marginTop: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                alignItems: "center",
              }}
            >
              {hayMas && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Mostrar {Math.min(PAGE_SIZE, gruposPorCliente.length - gruposPaginados.length)} clientes más
                </button>
              )}
              {(filtroEstado === "pagado" || filtroEstado === "todos") && hayMasPagados && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.875rem" }}
                  onClick={() => void cargarMasPagados()}
                  disabled={loadingPagados}
                >
                  {loadingPagados ? "Cargando..." : "Cargar más préstamos pagados del historial"}
                </button>
              )}
              {(filtroEstado === "castigado" || filtroEstado === "todos") && hayMasCastigados && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.875rem" }}
                  onClick={() => void cargarMasCastigados()}
                  disabled={loadingCastigados}
                >
                  {loadingCastigados ? "Cargando..." : "Cargar más pérdidas del historial"}
                </button>
              )}
              {(hayMasPagados || hayMasCastigados) && (
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
                  El historial completo no está cargado aún.
                </p>
              )}
            </div>
          )}
          {periodosLoading && prestamosFiltrados.length === 0 ? (
            <p className="prestamo-admin-filtro-vacio">Cargando periodos...</p>
          ) : null}
          {loadingPagados &&
          prestamosFiltrados.length === 0 &&
          (filtroEstado === "pagado" || filtroEstado === "todos") ? (
            <p className="prestamo-admin-filtro-vacio">Cargando préstamos pagados...</p>
          ) : null}
          {loadingCastigados &&
          prestamosFiltrados.length === 0 &&
          (filtroEstado === "castigado" || filtroEstado === "todos") ? (
            <p className="prestamo-admin-filtro-vacio">Cargando préstamos en pérdida...</p>
          ) : null}
          {prestamosFiltrados.length === 0 &&
          !loadingPagados &&
          !loadingCastigados &&
          !periodosLoading ? (
            <p className="prestamo-admin-filtro-vacio">
              {mensajePrestamosVaciosContable(
                filtroContable,
                periodos,
                filtroEstado,
                !!filtroNombreLower,
                !!filtroRutaId
              )}
            </p>
          ) : null}
          </>
        )}
        </div>
      </>
      )}

      {showModalPrestamo && (
        <ModalConfirmar
          titulo="Confirmar préstamo"
          labelConfirmar="Sí, crear préstamo"
          confirmando={creating}
          confirmarDeshabilitado={!online}
          confirmacionMarcada={confirmarModalPrestamo}
          onConfirmacionMarcadaChange={setConfirmarModalPrestamo}
          labelConfirmacion={
            <>
              Confirmo el desembolso de{" "}
              <strong>$ {formatMonedaPrestamoAdmin(montoNum)}</strong> a{" "}
              <strong>{clienteSeleccionado?.nombre ?? "—"}</strong>
            </>
          }
          onCancelar={() => {
            if (creating) return;
            setConfirmarModalPrestamo(false);
            setShowModalPrestamo(false);
          }}
          onConfirmar={() => { void handleEjecutarPrestamo(); }}
        >
          <p>Revisa los datos antes de desembolsar:</p>
          <p>
            Cliente: <strong>{clienteSeleccionado?.nombre ?? "—"}</strong>
          </p>
          {rutaSeleccionada && (
            <p>
              Ruta: <strong>{rutaSeleccionada.nombre ?? rutaSeleccionada.codigo ?? "—"}</strong>
            </p>
          )}
          <p>
            Monto: <strong>$ {formatMonedaPrestamoAdmin(montoNum)}</strong>
          </p>
          <p>
            Interés: <strong>{formatInteresResumenPct(iVal)}%</strong>
          </p>
          <p>
            Cuotas: <strong>{nCuotasVal} ({modalidadLabel})</strong>
          </p>
          <p>
            Total a pagar: <strong>$ {formatMonedaPrestamoAdmin(totalAPagar)}</strong>
          </p>
          <p>
            Cuota: <strong>$ {formatMonedaPrestamoAdmin(cuotaPorPago)}</strong>
          </p>
          {cajaRuta > 0 && (
            <p>
              Se descontará de la caja de la ruta: <strong>$ {formatMonedaPrestamoAdmin(cajaRuta - montoNum)}</strong> restantes.
            </p>
          )}
        </ModalConfirmar>
      )}

      {showExportModal && (
        <ExportPrestamosModal
          nombreEmpresa={nombreEmpresa}
          prestamos={prestamos}
          prestamosPagados={prestamosPagados}
          prestamosCastigados={prestamosCastigados}
          clientePorId={clientePorId}
          periodos={periodos}
          rutas={rutas}
          hayMasPagados={hayMasPagados}
          onCargarTodosPagados={cargarTodosPagados}
          loadingPagados={loadingPagados}
          filtrosIniciales={{ filtroContable, filtroEstado, filtroRutaId, filtroNombre }}
          onCerrar={() => setShowExportModal(false)}
        />
      )}

    </div>
  );
}
