"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { useTrabajadorLista } from "@/context/TrabajadorListaContext";
import {
  createPrestamo,
  esPrestamoMorosoPendiente,
  formatClienteCodigoRutaYNumero,
  listPeriodosAdmin,
  type ClienteItem,
  type PeriodoAdminListaItem,
  type PrestamoItem,
} from "@/lib/empresa-api";
import { formatInteresResumenPct, parseInteresPct } from "@/lib/interes-pct";
import {
  formatDebeSlashTotalCredito,
  formatFechaCreacionPrestamo,
} from "@/lib/prestamo-display";
import {
  filtrarPrestamosPorFiltroContable,
  mensajePrestamosVaciosContable,
  numeroPeriodoAdmin,
  periodoAbiertoAdmin,
  resolverRangoFiltroContable,
  type PrestamoFiltroContable,
  type PrestamoFiltroEstado,
} from "@/lib/prestamo-periodo-filter";
import { fechaDiaColombiaHoy, formatFechaDia } from "@/lib/colombia-day-bounds";
import { GastosPeriodoContableFilter } from "@/components/GastosPeriodoContableFilter";
import {
  sanitizeMontoDecimalCOP,
  formatMontoDecimalCOPDisplay,
  interiorDecimalCOPToNumber,
} from "@/lib/monto-input-es";
import SelectConBusqueda from "@/components/SelectConBusqueda";
import { ModalConfirmar } from "@/components/trabajador/ModalConfirmar";

const MODALIDADES = [
  { value: "diario", label: "Diario" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
] as const;

/** Límites de validación para creación de préstamos */
const MONTO_MIN = 1;
const CUOTAS_MAX = 999;
const INTERES_MAX = 50;

/** Formato moneda: miles con punto; decimales con coma solo si son distintos de cero (ej: 1.234 o 1.234,56) */
function formatMoneda(n: number): string {
  if (typeof n !== "number" || isNaN(n)) return "";
  const [entero, dec = ""] = n.toFixed(2).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decTrim = dec.replace(/0+$/, "");
  return decTrim ? `${conPuntos},${decTrim}` : conPuntos;
}

/** Cuotas ya pagadas (a partir de saldo y total). Para mostrar como "X / total". */
function cuotasPagadas(totalAPagar: number, numeroCuotas: number, saldoPendiente: number): number {
  if (totalAPagar <= 0 || numeroCuotas <= 0) return 0;
  if (saldoPendiente <= 0) return numeroCuotas;
  const cuotaUnit = totalAPagar / numeroCuotas;
  const pagado = totalAPagar - saldoPendiente;
  return Math.min(numeroCuotas, Math.round(pagado / cuotaUnit));
}

/** Orden de prioridad para mostrar préstamo principal: activo > pagado; luego más reciente primero. */
const ESTADO_ORDEN: Record<string, number> = { activo: 0, pagado: 1 };

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

function prestamoCoincideRuta(
  p: PrestamoItem,
  rutaId: string,
  clientePorId: Record<string, ClienteItem>
): boolean {
  if (!rutaId) return true;
  const rid = p.rutaId || clientePorId[p.clienteId]?.rutaId;
  return (rid ?? "") === rutaId;
}

function dedupePrestamos(list: PrestamoItem[]): PrestamoItem[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export default function PrestamoPage() {
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
    loading,
    error: listaError,
    refresh,
  } = useTrabajadorLista();
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
  const [confirmarMontoAlto, setConfirmarMontoAlto] = useState(false);
  const [filtroContable, setFiltroContable] = useState<PrestamoFiltroContable>({ modo: "hoy" });
  const [filtroEstado, setFiltroEstado] = useState<PrestamoFiltroEstado>("todos");
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroRutaId, setFiltroRutaId] = useState("");
  const [periodos, setPeriodos] = useState<PeriodoAdminListaItem[]>([]);
  const [periodosLoading, setPeriodosLoading] = useState(true);
  const [historialEconomicoColapsado, setHistorialEconomicoColapsado] = useState(true);

  useEffect(() => {
    setConfirmarMontoAlto(false);
  }, [rutaIdForm, clienteId, monto, numeroCuotas, interes, modalidad]);

  const abrirFormularioCrear = useCallback(() => {
    setConfirmarMontoAlto(false);
    setShowModalPrestamo(false);
    setError(null);
    setShowCreateForm(true);
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
    if (filtroEstado !== "pagado" && filtroEstado !== "todos") {
      return;
    }
    if (loadingPagados || !hayMasPagados) return;
    if (filtroEstado === "pagado" && prestamosPagados.length > 0) return;
    void cargarMasPagados();
  }, [
    filtroEstado,
    loadingPagados,
    hayMasPagados,
    prestamosPagados.length,
    cargarMasPagados,
  ]);

  const handleSubmit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!user) return;
    const montoNum = interiorDecimalCOPToNumber(monto);
    const nCuotas = Math.max(1, parseInt(numeroCuotas, 10) || 1);
    const iVal = parseInteresPct(interes);

    if (isNaN(montoNum) || montoNum < MONTO_MIN) {
      setError(`El monto debe ser al menos ${formatMoneda(MONTO_MIN)}`);
      return;
    }
    if (cajaRuta > 0 && montoNum > cajaRuta) {
      setError("El monto supera la base disponible");
      return;
    }
    if (montoNum > MONTO_MAX) {
      setError(`El monto no puede superar ${formatMoneda(MONTO_MAX)}`);
      return;
    }
    if (nCuotas > CUOTAS_MAX) {
      setError(`El número de cuotas no puede superar ${CUOTAS_MAX}`);
      return;
    }
    if (iVal < 0 || iVal > INTERES_MAX) {
      setError(`El interés debe estar entre 0 y ${INTERES_MAX}%`);
      return;
    }
    if (!confirmarMontoAlto) {
      setError(
        montoNum >= MONTO_CONFIRMAR_ALTO
          ? `Confirma que deseas crear un préstamo de ${formatMoneda(montoNum)} marcando la casilla`
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
    setError(null);
    setShowModalPrestamo(true);
  };

  const handleEjecutarPrestamo = async () => {
    if (!user || !confirmarMontoAlto) return;
    const montoNum = interiorDecimalCOPToNumber(monto);
    const nCuotas = Math.max(1, parseInt(numeroCuotas, 10) || 1);

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
      });
      setRutaIdForm("");
      setClienteId("");
      setMonto("");
      setNumeroCuotas("");
      setInteres("");
      setModalidad("mensual");
      setConfirmarMontoAlto(false);
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
    MODALIDADES.find((m) => m.value === modalidad)?.label ?? modalidad;

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

  const contadoresPorFiltro = useMemo(() => {
    const porRuta = (list: PrestamoItem[]) =>
      list.filter((p) => prestamoCoincideRuta(p, filtroRutaId, clientePorId));

    const mergedUnicos = dedupePrestamos([...prestamos, ...prestamosPagados]);
    const mergedEnPeriodo = filtrarPrestamosPorFiltroContable(
      mergedUnicos,
      filtroContable,
      periodos
    );
    const activosEnPeriodo = filtrarPrestamosPorFiltroContable(
      prestamos.filter((p) => p.estado === "activo"),
      filtroContable,
      periodos
    );
    const pagadosEnPeriodo = filtrarPrestamosPorFiltroContable(
      prestamosPagados,
      filtroContable,
      periodos
    );

    return {
      todos: porRuta(mergedEnPeriodo).length,
      activo: porRuta(activosEnPeriodo).length,
      pagado: porRuta(pagadosEnPeriodo).length,
      moroso: porRuta(
        activosEnPeriodo.filter((p) =>
          esPrestamoMorosoPendiente(p, clientePorId[p.clienteId]?.moroso)
        )
      ).length,
    };
  }, [prestamos, prestamosPagados, clientePorId, filtroRutaId, filtroContable, periodos]);

  const formatContadorFiltro = (est: PrestamoFiltroEstado) => {
    const n = contadoresPorFiltro[est];
    const masPendiente =
      hayMasPagados && (est === "pagado" || est === "todos");
    return masPendiente ? `${n}+` : String(n);
  };

  const FILTROS_PRESTAMO: { est: PrestamoFiltroEstado; label: string }[] = [
    { est: "todos", label: "Todos" },
    { est: "activo", label: "Activos" },
    { est: "pagado", label: "Pagados" },
    { est: "moroso", label: "Morosos" },
  ];

  const filtroNombreLower = filtroNombre.trim().toLowerCase();

  const prestamosBase = useMemo(() => {
    if (filtroEstado === "pagado") return prestamosPagados;
    if (filtroEstado === "activo") {
      return prestamos.filter((p) => p.estado === "activo");
    }
    if (filtroEstado === "moroso") {
      return prestamos.filter((p) =>
        esPrestamoMorosoPendiente(p, clientePorId[p.clienteId]?.moroso)
      );
    }
    return dedupePrestamos([...prestamos, ...prestamosPagados]);
  }, [prestamos, prestamosPagados, filtroEstado, clientePorId]);

  const prestamosPorPeriodo = useMemo(
    () => filtrarPrestamosPorFiltroContable(prestamosBase, filtroContable, periodos),
    [prestamosBase, filtroContable, periodos]
  );

  const prestamosFiltrados = useMemo(() => {
    let list = prestamosPorPeriodo;
    if (filtroRutaId) {
      list = list.filter((p) => prestamoCoincideRuta(p, filtroRutaId, clientePorId));
    }
    if (filtroNombreLower) {
      list = list.filter((p) => {
        const cl = clientePorId[p.clienteId];
        if (!cl) return false;
        const nombre = (cl.nombre ?? "").toLowerCase();
        const codigo = cl.codigo ? formatClienteCodigoRutaYNumero(cl.codigo).toLowerCase() : "";
        const cedula = (cl.cedula ?? "").toLowerCase();
        return (
          nombre.includes(filtroNombreLower) ||
          codigo.includes(filtroNombreLower) ||
          cedula.includes(filtroNombreLower)
        );
      });
    }
    return list;
  }, [prestamosPorPeriodo, filtroRutaId, filtroNombreLower, clientePorId]);

  const totalDesembolsadoPeriodo = useMemo(
    () =>
      Math.round(
        prestamosFiltrados.reduce((sum, p) => sum + (typeof p.monto === "number" ? p.monto : 0), 0) *
          100
      ) / 100,
    [prestamosFiltrados]
  );

  const PAGE_SIZE = 15;
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    setPagina(1);
  }, [filtroEstado, filtroContable, filtroNombre, filtroRutaId]);

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
      return tb - ta;
    });
    return grupos;
  }, [prestamosFiltrados]);

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
    for (const p of [...prestamos, ...prestamosPagados]) {
      if (p.clienteId !== clienteId || ids.has(p.id)) continue;
      ids.add(p.id);
      merged.push(p);
    }
    return ordenarPrestamosParaPrincipal(merged);
  }, [prestamos, prestamosPagados, clienteId]);

  if (!profile || profile.role !== "admin") return null;

  const bannerPeriodo = (() => {
    if (filtroContable.modo === "hoy") {
      const hoy = fechaDiaColombiaHoy();
      return {
        tone: "neutral" as const,
        titulo: "Desembolsos de hoy",
        detalle: `${formatFechaDia(hoy)} · ${prestamosFiltrados.length} préstamo${prestamosFiltrados.length !== 1 ? "s" : ""} · $ ${formatMoneda(totalDesembolsadoPeriodo)} colocados.`,
      };
    }
    if (filtroContable.modo === "todo") {
      return {
        tone: "neutral" as const,
        titulo: "Todo el historial",
        detalle: `${prestamosFiltrados.length} préstamo${prestamosFiltrados.length !== 1 ? "s" : ""} con los filtros actuales.`,
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
        detalle: "Selecciona otro periodo o revisa el Resumen económico.",
      };
    }
    const num =
      rangoContable.numeroPeriodo ?? numeroPeriodoAdmin(rangoContable.periodo.id, periodos);
    if (rangoContable.periodo.estado === "abierto") {
      return {
        tone: "active" as const,
        titulo: `Periodo #${num ?? "—"} · Abierto`,
        detalle: `${prestamosFiltrados.length} préstamo${prestamosFiltrados.length !== 1 ? "s" : ""} · $ ${formatMoneda(totalDesembolsadoPeriodo)} colocados.`,
      };
    }
    return {
      tone: "neutral" as const,
      titulo: `Periodo #${num ?? "—"} · Cerrado`,
      detalle: `${prestamosFiltrados.length} préstamo${prestamosFiltrados.length !== 1 ? "s" : ""} · $ ${formatMoneda(totalDesembolsadoPeriodo)} colocados.`,
    };
  })();

  return (
    <div className="card prestamo-admin-page">
      {showCreateForm && (
      <form
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== "TEXTAREA") e.preventDefault();
        }}
        className="card prestamo-admin-create-form"
        style={{ marginBottom: "1.25rem" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Nuevo préstamo</h3>
          <button
            type="button"
            onClick={() => setShowCreateForm(false)}
            aria-label="Cerrar formulario y volver al listado"
            title="Cerrar"
            style={{ padding: "0.35rem 0.6rem", minWidth: "auto", lineHeight: 1, flexShrink: 0 }}
            className="btn btn-primary"
          >
            ×
          </button>
        </div>
        <div className="prestamo-admin-create-row prestamo-admin-create-row--top">
          <div className="form-group prestamo-admin-create-ruta">
            <label>Ruta</label>
            <select
              value={rutaIdForm}
              onChange={(e) => setRutaIdForm(e.target.value)}
              required
              style={{ width: "100%", padding: "0.5rem" }}
              aria-label="Seleccionar ruta"
            >
              <option value="">Seleccionar ruta</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                  {r.ubicacion ? ` · ${r.ubicacion}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group prestamo-admin-create-cliente">
            <label>Cliente</label>
            <SelectConBusqueda
              value={clienteId}
              onChange={setClienteId}
              options={opcionesClientePrestamo}
              placeholder={rutaIdForm ? "Buscar cliente…" : "Primero elige una ruta"}
              disabled={!rutaIdForm}
              required={Boolean(rutaIdForm)}
              aria-label="Seleccionar cliente"
              hint={hintClientePrestamo}
            />
            {clienteSeleccionado && (
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: 0 }}>
                Cliente:{" "}
                {clienteSeleccionado.codigo && (
                  <span className="cliente-code">{formatClienteCodigoRutaYNumero(clienteSeleccionado.codigo)}</span>
                )}
                {clienteSeleccionado.codigo && " · "}
                <strong>{clienteSeleccionado.nombre}</strong>
                {clienteSeleccionado.cedula && <> · Céd. {clienteSeleccionado.cedula}</>}
              </p>
            )}
          </div>
          <div className="form-group prestamo-admin-create-monto">
            <label>Cantidad a prestar</label>
            <input
              type="text"
              inputMode="decimal"
              value={monto ? formatMontoDecimalCOPDisplay(monto) : ""}
              onChange={(e) => setMonto(sanitizeMontoDecimalCOP(e.target.value))}
              required
              placeholder="0,00"
            />
            {rutaIdForm && (
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                Base disponible en ruta: <strong>$ {formatMoneda(cajaRuta)}</strong>
              </p>
            )}
          </div>
        </div>

        {clienteId && (
          <div className="form-group" style={{ marginBottom: "1.25rem", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setHistorialEconomicoColapsado((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "var(--card-bg)",
                border: "none",
                color: "var(--text)",
                fontSize: "1rem",
                cursor: "pointer",
                textAlign: "left",
              }}
              aria-expanded={!historialEconomicoColapsado}
              aria-controls="historial-economico-content"
              id="historial-economico-toggle"
            >
              <span style={{ fontWeight: 600 }}>Historial económico</span>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }} aria-hidden>
                {historialEconomicoColapsado ? "Expandir ▼" : "Colapsar ▲"}
              </span>
            </button>
            <div id="historial-economico-content" role="region" aria-labelledby="historial-economico-toggle" style={{ display: historialEconomicoColapsado ? "none" : "block", padding: "0 0.75rem 0.75rem" }}>
              {loading ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "0.5rem 0 0" }}>Cargando...</p>
              ) : prestamosDelCliente.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "0.5rem 0 0" }}>Este cliente no tiene préstamos anteriores.</p>
              ) : (
                <div className="table-wrap" style={{ marginTop: "0.5rem" }}>
                  <table>
                    <thead>
                      <tr>
                        <th className="col-num">Monto</th>
                        <th className="col-num">Total a pagar</th>
                        <th className="col-num">Saldo</th>
                        <th>Estado</th>
                        <th>Frecuencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prestamosDelCliente.map((p) => (
                        <tr key={p.id}>
                          <td className="col-num">{formatMoneda(p.monto)}</td>
                          <td className="col-num">{formatMoneda(p.totalAPagar)}</td>
                          <td className="col-num">{formatMoneda(p.saldoPendiente)}</td>
                          <td>{p.estado}</td>
                          <td>{p.modalidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {historialEconomicoColapsado && !loading && (
              <p style={{ padding: "0 0.75rem 0.75rem", margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
                {prestamosDelCliente.length === 0 ? "Sin préstamos anteriores" : `${prestamosDelCliente.length} préstamo${prestamosDelCliente.length !== 1 ? "s" : ""} registrado${prestamosDelCliente.length !== 1 ? "s" : ""}. Haz clic en «Expandir» para ver el detalle.`}
              </p>
            )}
          </div>
        )}

        <div className="prestamo-admin-create-row prestamo-admin-create-row--terms">
          <div className="form-group prestamo-admin-create-freq">
            <label>Frecuencia de pago</label>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as "diario" | "semanal" | "mensual")}
              style={{ width: "100%", padding: "0.5rem" }}
            >
              {MODALIDADES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group prestamo-admin-create-cuotas">
            <label>Número de cuotas</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={CUOTAS_MAX}
              value={numeroCuotas}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (v === "" || /^\d+$/.test(v)) setNumeroCuotas(v);
              }}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "e" || k === "E" || k === "+" || k === "-" || k === "." || k === ",") e.preventDefault();
              }}
              placeholder="Ej: 12"
              required
              aria-label="Número de cuotas"
            />
          </div>
          <div className="form-group prestamo-admin-create-interes">
            <label>Interés (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={interes}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v === "" || /^\d*\.?\d*$/.test(v)) setInteres(v);
              }}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "e" || k === "E" || k === "+" || k === "-") e.preventDefault();
              }}
              placeholder="Ej: 10"
              aria-label="Interés en porcentaje"
            />
          </div>
          <div className="form-group prestamo-admin-create-cuota">
            <label>Cuota</label>
            <input
              type="text"
              readOnly
              value={
                (() => {
                  const montoNum = interiorDecimalCOPToNumber(monto);
                  const nCuotas = parseInt(numeroCuotas, 10);
                  const iVal = parseInteresPct(interes);
                  if (isNaN(montoNum) || montoNum <= 0 || !nCuotas || nCuotas < 1) return "—";
                  const total = montoNum * (1 + iVal / 100);
                  return formatMoneda(total / nCuotas);
                })()
              }
              aria-label="Cuota (calculada)"
              style={{ backgroundColor: "var(--bg)", cursor: "default" }}
            />
          </div>
        </div>
        {totalAPagar > 0 && (
          <div
            className="form-group"
            style={{
              padding: "1rem",
              backgroundColor: "var(--bg)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.95rem" }}>Resumen del préstamo</h4>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
              <li>Monto a prestar: <strong>{formatMoneda(montoNum)}</strong></li>
              <li>Interés: <strong>{formatInteresResumenPct(iVal)}%</strong></li>
              <li>Total a pagar: <strong>{formatMoneda(totalAPagar)}</strong></li>
              <li>Número de cuotas: <strong>{nCuotasVal}</strong> ({modalidad})</li>
              <li>Cuota por pago: <strong>{formatMoneda(cuotaPorPago)}</strong></li>
            </ul>
          </div>
        )}

        {(error || listaError) && (
          <p className="error-msg">{error ?? listaError}</p>
        )}
        <div className="prestamo-nuevo-actions prestamo-admin-create-actions">
          <label className="prestamo-nuevo-confirm-label prestamo-admin-create-confirm-label">
            <input
              type="checkbox"
              checked={confirmarMontoAlto}
              onChange={(e) => setConfirmarMontoAlto(e.target.checked)}
              aria-label={
                requiereConfirmarMonto
                  ? `Confirmo creación de préstamo por ${formatMoneda(montoNum)}`
                  : "Confirmo creación del préstamo"
              }
            />
            <span>
              {requiereConfirmarMonto ? (
                <>
                  Confirmo el préstamo <strong>{formatMoneda(montoNum)}</strong>
                </>
              ) : (
                "Confirmo"
              )}
            </span>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={creating || !confirmarMontoAlto}
            onClick={() => handleSubmit()}
            aria-disabled={creating || !confirmarMontoAlto}
          >
            {creating ? "Creando..." : "Crear préstamo"}
          </button>
        </div>
      </form>
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
                <span className="prestamo-admin-kpi-value">$ {formatMoneda(resumenPrestamos.saldoPorRecoger)}</span>
              </div>
              <span className="prestamo-admin-kpi-icon prestamo-admin-kpi-icon--recoger" aria-hidden>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </span>
            </div>
            </div>
          </div>
        )}
        <div className={`card prestamo-admin-hist-card${filtroEstado === "moroso" ? " prestamo-admin-hist-card--moroso" : ""}`}>
        <div className="prestamo-admin-hist-head">
          <h3 className="prestamo-admin-hist-title">Historial de préstamos</h3>
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
        {loading ? (
          <p className="prestamo-admin-loading">Cargando…</p>
        ) : prestamos.length === 0 &&
          prestamosPagados.length === 0 &&
          !loadingPagados &&
          filtroEstado !== "pagado" &&
          filtroContable.modo === "todo" ? (
          <p className="prestamo-admin-empty">No hay préstamos en el historial.</p>
        ) : (
          <>
            <div
              className={`gastos-admin-periodo-banner prestamo-admin-periodo-banner gastos-admin-periodo-banner--${bannerPeriodo.tone}`}
              role="status"
            >
              <div className="gastos-admin-periodo-banner-text">
                <strong>{bannerPeriodo.titulo}</strong>
                <span>{bannerPeriodo.detalle}</span>
              </div>
            </div>

            <div className="prestamo-admin-filtros-wrap">
              <GastosPeriodoContableFilter
                filtro={filtroContable}
                onChange={setFiltroContable}
                periodos={periodos}
              />

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
                  <button
                    key={est}
                    type="button"
                    role="tab"
                    aria-selected={filtroEstado === est}
                    className={`prestamo-admin-tab${filtroEstado === est ? " prestamo-admin-tab--active" : ""}`}
                    onClick={() => setFiltroEstado(est)}
                    aria-label={`${label}, ${contadoresPorFiltro[est]} préstamo${contadoresPorFiltro[est] !== 1 ? "s" : ""}`}
                  >
                    {label}
                    <span className="prestamo-admin-tab-count">({formatContadorFiltro(est)})</span>
                  </button>
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
                  <th>Fecha</th>
                  <th className="col-num">
                    <span className="prestamo-admin-monto-th-desktop">Monto</span>
                    <span className="prestamo-admin-monto-th-mobile">Debe</span>
                  </th>
                  <th className="col-num">Total a pagar</th>
                  <th className="col-num">Saldo</th>
                  <th className="col-num">Cuotas</th>
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
                        <td className="prestamo-histo-col-fecha" title="Fecha de creación">
                          {formatFechaCreacionPrestamo(principal)}
                        </td>
                        <td className="col-num">
                          <span className="prestamo-admin-monto-desktop">{formatMoneda(principal.monto)}</span>
                          <span className="prestamo-admin-monto-mobile">
                            {formatDebeSlashTotalCredito(principal.saldoPendiente, principal)}
                          </span>
                        </td>
                        <td className="col-num">{formatMoneda(principal.totalAPagar)}</td>
                        <td className="col-num">{formatMoneda(principal.saldoPendiente)}</td>
                        <td className="col-num" title="Cuotas pagadas / total">{pagadas} / {principal.numeroCuotas}</td>
                        <td>
                          <span
                            className={`prestamo-admin-estado${principal.estado === "activo" || principal.estado === "pagado" ? ` prestamo-admin-estado--${principal.estado}` : ""}`}
                          >
                            {principal.estado}
                          </span>
                        </td>
                        <td>{principal.modalidad}</td>
                        <td className="prestamo-admin-cobro-cell">
                          {principal.estado === "activo" && (
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
                        <tr id={`historial-cliente-${grupo.clienteId}`} aria-labelledby={`btn-expand-${grupo.clienteId}`}>
                          <td colSpan={11} className="prestamo-admin-expand-panel">
                            <div className="historial-prestamos-list" style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                              <span style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem", display: "block" }}>Otros préstamos</span>
                              <ul>
                                {otros.map((p) => (
                                    <li key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                      {formatMoneda(p.monto)} · {formatFechaCreacionPrestamo(p)} · {p.estado} · {p.numeroCuotas} cuotas
                                      {p.estado === "activo" && (
                                        <Link
                                          href={`/dashboard/admin/cobrar?clienteId=${grupo.clienteId}&prestamoId=${p.id}`}
                                          className="btn btn-primary prestamo-admin-cobro-btn prestamo-admin-cobro-btn--sm"
                                        >
                                          Registrar cobro
                                        </Link>
                                      )}
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hayMas && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPagina((p) => p + 1)}
              >
                Ver más préstamos
              </button>
            </div>
          )}
          {(filtroEstado === "pagado" || filtroEstado === "todos") && hayMasPagados ? (
            <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void cargarMasPagados()}
                disabled={loadingPagados}
              >
                {loadingPagados ? "Cargando..." : "Ver más pagados"}
              </button>
            </div>
          ) : null}
          {periodosLoading && prestamosFiltrados.length === 0 ? (
            <p className="prestamo-admin-filtro-vacio">Cargando periodos...</p>
          ) : null}
          {loadingPagados && prestamosFiltrados.length === 0 ? (
            <p className="prestamo-admin-filtro-vacio">Cargando préstamos pagados...</p>
          ) : null}
          {prestamosFiltrados.length === 0 && !loadingPagados && !periodosLoading ? (
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
          onCancelar={() => {
            if (creating) return;
            setShowModalPrestamo(false);
          }}
          onConfirmar={() => { void handleEjecutarPrestamo(); }}
        >
          <p>¿Estás seguro de crear este préstamo?</p>
          <p>
            Cliente: <strong>{clienteSeleccionado?.nombre ?? "—"}</strong>
          </p>
          {rutaSeleccionada && (
            <p>
              Ruta: <strong>{rutaSeleccionada.nombre ?? rutaSeleccionada.codigo ?? "—"}</strong>
            </p>
          )}
          <p>
            Monto: <strong>$ {formatMoneda(montoNum)}</strong>
          </p>
          <p>
            Interés: <strong>{formatInteresResumenPct(iVal)}%</strong>
          </p>
          <p>
            Cuotas: <strong>{nCuotasVal} ({modalidadLabel})</strong>
          </p>
          <p>
            Total a pagar: <strong>$ {formatMoneda(totalAPagar)}</strong>
          </p>
          <p>
            Cuota: <strong>$ {formatMoneda(cuotaPorPago)}</strong>
          </p>
          {cajaRuta > 0 && (
            <p>
              Se descontará de la caja de la ruta: <strong>$ {formatMoneda(montoNum)}</strong>
            </p>
          )}
        </ModalConfirmar>
      )}
    </div>
  );
}
