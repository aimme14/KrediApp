"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useAdminDashboard } from "@/context/AdminDashboardContext";
import { getEmpresa } from "@/lib/empresa";
import { listPeriodosAdmin, type PeriodoAdminListaItem } from "@/lib/empresa-api";
import {
  usePagosDiariosAdmin,
  type PagoDiarioAdminItem,
} from "@/hooks/usePagosDiariosAdmin";
import {
  fechaDiaColombiaHoy,
  parseFechaDiaColombia,
} from "@/lib/colombia-day-bounds";
import { pagoOcurreEnPeriodoAbierto } from "@/lib/gastos-periodo-filter";
import { isAdminPanelRole } from "@/lib/admin-panel-role";
import {
  formatFechaImpresionPagosDiarios,
  formatHoraPagosDiarios,
  formatMontoPagosDiarios,
  labelMetodoPagosDiarios,
  labelRegistradorPagosDiarios,
  labelTipoPagosDiarios,
} from "@/lib/pagos-diarios-display";
import {
  calcularTotalesPagosDiariosAdmin,
  filtrarPagosDiariosAdmin,
} from "@/lib/pagos-diarios-filter";

const PagosDiariosAnulacionModal = dynamic(
  () => import("@/components/admin/pagos-diarios/PagosDiariosAnulacionModal"),
  { ssr: false }
);

type EstadoModal =
  | { abierto: false }
  | {
      abierto: true;
      item: PagoDiarioAdminItem;
      motivo: string;
      confirmacionMarcada: boolean;
      cargando: boolean;
      errorModal: string | null;
    };

export default function PagosDiariosPageContent() {
  const { user, profile } = useAuth();
  const { rutas } = useAdminDashboard();
  const hoy = fechaDiaColombiaHoy();
  const [fecha, setFecha] = useState(hoy);
  const [fechaBusqueda, setFechaBusqueda] = useState(hoy);
  const [errorFiltro, setErrorFiltro] = useState<string | null>(null);
  const [filtroRutaId, setFiltroRutaId] = useState("");
  const [filtroNombre, setFiltroNombre] = useState("");
  const { pagos, loading, error } = usePagosDiariosAdmin(fechaBusqueda);
  const [modal, setModal] = useState<EstadoModal>({ abierto: false });
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [periodos, setPeriodos] = useState<PeriodoAdminListaItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user
      .getIdToken()
      .then((token) => listPeriodosAdmin(token))
      .then((list) => {
        if (!cancelled) setPeriodos(list);
      })
      .catch(() => {
        if (!cancelled) setPeriodos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const empresaId = profile?.empresaId;
    if (!empresaId) return;
    let cancelled = false;
    getEmpresa(empresaId)
      .then((data) => {
        if (!cancelled && data?.nombre?.trim()) {
          setNombreEmpresa(data.nombre.trim());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile?.empresaId]);

  const filtroNombreLower = filtroNombre.trim().toLowerCase();
  const hayFiltrosActivos = Boolean(filtroRutaId) || Boolean(filtroNombreLower);

  const pagosFiltrados = useMemo(
    () =>
      filtrarPagosDiariosAdmin(pagos, {
        rutaId: filtroRutaId,
        nombreCliente: filtroNombre,
      }),
    [pagos, filtroRutaId, filtroNombre]
  );

  const totales = useMemo(
    () => calcularTotalesPagosDiariosAdmin(pagosFiltrados),
    [pagosFiltrados]
  );

  const cobros = useMemo(
    () => pagosFiltrados.filter((p) => p.tipo === "pago"),
    [pagosFiltrados]
  );
  const otros = useMemo(
    () => pagosFiltrados.filter((p) => p.tipo !== "pago"),
    [pagosFiltrados]
  );

  const rutaSeleccionada = useMemo(
    () => rutas.find((r) => r.id === filtroRutaId),
    [rutas, filtroRutaId]
  );

  const abrirModal = useCallback((item: PagoDiarioAdminItem) => {
    setModal({
      abierto: true,
      item,
      motivo: "",
      confirmacionMarcada: false,
      cargando: false,
      errorModal: null,
    });
  }, []);

  const cerrarModal = useCallback(() => {
    setModal({ abierto: false });
  }, []);

  const imprimirPagos = useCallback(() => {
    const tituloAnterior = document.title;
    document.title = " ";
    const restaurarTitulo = () => {
      document.title = tituloAnterior;
      window.removeEventListener("afterprint", restaurarTitulo);
    };
    window.addEventListener("afterprint", restaurarTitulo);
    window.print();
  }, []);

  const handleBuscar = useCallback(() => {
    if (!parseFechaDiaColombia(fecha).ok) {
      setErrorFiltro("Selecciona una fecha válida.");
      return;
    }
    setErrorFiltro(null);
    setFechaBusqueda(fecha);
  }, [fecha]);

  const confirmarAnulacion = useCallback(async () => {
    if (!modal.abierto || !user) return;
    const { item, motivo } = modal;

    setModal((prev) => (prev.abierto ? { ...prev, cargando: true, errorModal: null } : prev));

    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/empresa/prestamos/${encodeURIComponent(item.prestamoId)}/pagos/${encodeURIComponent(item.id)}/anular`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ motivo: motivo.trim(), idempotencyKey: `anular:${item.id}` }),
        }
      );

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setModal((prev) =>
          prev.abierto
            ? {
                ...prev,
                cargando: false,
                errorModal: data.error ?? "Error al anular el pago.",
              }
            : prev
        );
        return;
      }

      cerrarModal();
    } catch {
      setModal((prev) =>
        prev.abierto
          ? { ...prev, cargando: false, errorModal: "Error de conexión. Intenta de nuevo." }
          : prev
      );
    }
  }, [modal, cerrarModal, user]);

  if (!profile || !isAdminPanelRole(profile.role)) return null;

  return (
    <>
      <div className="card pagos-diarios-page" style={{ maxWidth: "960px" }}>
        <header
          style={{
            marginBottom: "1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 0.35rem" }}>Pagos diarios</h2>
          </div>
          <button
            type="button"
            onClick={imprimirPagos}
            disabled={loading || pagosFiltrados.length === 0}
            className="btn no-print"
            style={{ whiteSpace: "nowrap", alignSelf: "center" }}
          >
            Descargar pagos
          </button>
        </header>

        <div className="print-only" style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
          {nombreEmpresa && (
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{nombreEmpresa}</div>
          )}
          <div>
            <strong>Pagos diarios</strong>
            <span style={{ marginLeft: "0.5rem" }}>
              — {formatFechaImpresionPagosDiarios(fechaBusqueda)}
            </span>
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            Generado: {new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}
          </div>
          {hayFiltrosActivos && (
            <div style={{ marginTop: "0.35rem" }}>
              Filtros:{" "}
              {filtroRutaId
                ? `Ruta ${rutaSeleccionada?.nombre?.trim() || filtroRutaId}`
                : "Todas las rutas"}
              {filtroNombreLower ? ` · Cliente «${filtroNombre.trim()}»` : ""}
            </div>
          )}
        </div>

        <div className="no-print pagos-diarios-filtros">
          <div className="pagos-diarios-filtros-fila">
            <label
              htmlFor="pagos-diarios-fecha"
              className="pagos-diarios-filtro-campo"
            >
              <span className="pagos-diarios-filtro-label">Fecha</span>
              <input
                id="pagos-diarios-fecha"
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  setErrorFiltro(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleBuscar();
                  }
                }}
                className="input"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary pagos-diarios-btn-buscar"
              onClick={handleBuscar}
              disabled={loading && fecha === fechaBusqueda}
            >
              Buscar
            </button>
          </div>

          <div className="pagos-diarios-filtros-fila pagos-diarios-filtros-fila--secundaria">
            <div className="admin-clientes-filtro-ruta pagos-diarios-filtro-ruta">
              <label htmlFor="pagos-diarios-filtro-ruta" className="admin-clientes-filtro-ruta-label">
                Ruta
              </label>
              <select
                id="pagos-diarios-filtro-ruta"
                className="admin-clientes-filtro-ruta-select"
                value={filtroRutaId}
                onChange={(e) => setFiltroRutaId(e.target.value)}
                aria-label="Filtrar pagos por ruta"
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

            <label htmlFor="pagos-diarios-buscador" className="pagos-diarios-filtro-cliente">
              <span className="admin-clientes-filtro-ruta-label">Cliente</span>
              <div className="prestamo-admin-search-field pagos-diarios-search-field">
                <span className="prestamo-admin-search-icon" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <input
                  id="pagos-diarios-buscador"
                  className="prestamo-admin-search-input pagos-diarios-search-input"
                  type="search"
                  value={filtroNombre}
                  onChange={(e) => setFiltroNombre(e.target.value)}
                  placeholder="Buscar por nombre..."
                  aria-label="Buscar pagos por nombre de cliente"
                />
              </div>
            </label>
          </div>

          {hayFiltrosActivos && !loading && pagos.length > 0 && (
            <p className="pagos-diarios-filtros-hint">
              {pagosFiltrados.length} registro{pagosFiltrados.length !== 1 ? "s" : ""} con los
              filtros actuales
              {pagosFiltrados.length !== pagos.length
                ? ` (de ${pagos.length} en el día)`
                : ""}
            </p>
          )}
        </div>

        {fecha !== fechaBusqueda && !loading && (
          <p
            className="no-print"
            style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--text-muted)" }}
          >
            Pulsa Buscar para cargar los pagos del {formatFechaImpresionPagosDiarios(fecha)}.
          </p>
        )}

        {errorFiltro && (
          <p role="alert" className="pagos-diarios-anular-error no-print" style={{ marginBottom: "1rem" }}>
            {errorFiltro}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          <TarjetaResumen
            label="Cobros"
            valor={formatMontoPagosDiarios(totales.totalCobros)}
            sub={`${totales.countCobros} registro(s)`}
          />
          <TarjetaResumen label="Efectivo" valor={formatMontoPagosDiarios(totales.totalEfectivo)} />
          <TarjetaResumen
            label="Transferencia"
            valor={formatMontoPagosDiarios(totales.totalTransferencia)}
          />
          <TarjetaResumen
            label="No pagó / Pérdida"
            valor={`${totales.countNoPagos} / ${totales.countPerdidas}`}
          />
        </div>

        {error && (
          <p role="alert" className="pagos-diarios-anular-error" style={{ marginBottom: "1rem" }}>
            {error}
          </p>
        )}

        {loading ? (
          <p>Cargando pagos del día…</p>
        ) : pagos.length === 0 ? (
          <p style={{ opacity: 0.8 }}>
            No hay registros para esta fecha. Si esperabas ver cobros anteriores al despliegue,
            ejecutá el backfill de auditoría.
          </p>
        ) : pagosFiltrados.length === 0 ? (
          <p style={{ opacity: 0.8 }}>
            No hay registros que coincidan con los filtros actuales
            {filtroRutaId ? ` (ruta: ${rutaSeleccionada?.nombre?.trim() || filtroRutaId})` : ""}
            {filtroNombreLower ? ` (cliente: «${filtroNombre.trim()}»)` : ""}.
          </p>
        ) : (
          <>
            <section style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Cobros</h3>
              {cobros.length === 0 ? (
                <p style={{ opacity: 0.75, margin: 0 }}>
                  {hayFiltrosActivos ? "Sin cobros con estos filtros." : "Sin cobros este día."}
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gap: "0.5rem",
                  }}
                >
                  {cobros.map((item) => (
                    <PagoDiarioRow
                      key={`${item.prestamoId}-${item.id}`}
                      item={item}
                      periodos={periodos}
                      onAnular={abrirModal}
                    />
                  ))}
                </ul>
              )}
            </section>

            {otros.length > 0 && (
              <section>
                <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Otros registros</h3>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gap: "0.5rem",
                  }}
                >
                  {otros.map((item) => (
                    <PagoDiarioRow
                      key={`${item.prestamoId}-${item.id}`}
                      item={item}
                      periodos={periodos}
                      onAnular={abrirModal}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {modal.abierto && (
        <PagosDiariosAnulacionModal
          item={modal.item}
          motivo={modal.motivo}
          confirmacionMarcada={modal.confirmacionMarcada}
          cargando={modal.cargando}
          errorModal={modal.errorModal}
          onMotivoChange={(v) => setModal((prev) => (prev.abierto ? { ...prev, motivo: v } : prev))}
          onConfirmacionMarcadaChange={(marcada) =>
            setModal((prev) => (prev.abierto ? { ...prev, confirmacionMarcada: marcada } : prev))
          }
          onConfirmar={confirmarAnulacion}
          onCerrar={cerrarModal}
        />
      )}
    </>
  );
}

function TarjetaResumen({
  label,
  valor,
  sub,
}: {
  label: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="card" style={{ padding: "0.75rem 1rem", margin: 0 }}>
      <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{valor}</div>
      {sub && <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{sub}</div>}
    </div>
  );
}

function PagoDiarioRow({
  item,
  periodos,
  onAnular,
}: {
  item: PagoDiarioAdminItem;
  periodos: PeriodoAdminListaItem[];
  onAnular: (item: PagoDiarioAdminItem) => void;
}) {
  const anulado = item.estado === "anulado";

  const esAnulableEnPeriodo =
    item.tipo === "pago" &&
    !anulado &&
    item.fecha !== null &&
    pagoOcurreEnPeriodoAbierto(item.fecha, periodos);

  const monto =
    item.tipo === "pago"
      ? formatMontoPagosDiarios(item.monto)
      : item.tipo === "perdida"
        ? formatMontoPagosDiarios(item.monto)
        : "—";

  return (
    <li
      style={{
        border: "1px solid var(--card-border)",
        borderRadius: "8px",
        padding: "0.75rem 1rem",
      }}
      className={anulado ? "pagos-diarios-row-anulado" : undefined}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "0.5rem",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            {item.clienteNombre}
            {anulado && <span className="pagos-diarios-badge-anulado">Anulado</span>}
          </div>
          <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            {item.rutaNombre} · {formatHoraPagosDiarios(item.fecha)} · {labelTipoPagosDiarios(item)}
            {item.tipo === "pago" && ` · ${labelMetodoPagosDiarios(item.metodoPago)}`}
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.65 }}>
            Por {labelRegistradorPagosDiarios(item)}
            {item.prestamoId && (
              <>
                {" · "}
                <Link
                  href={`/dashboard/admin/prestamo?prestamo=${encodeURIComponent(item.prestamoId)}`}
                  className="pagos-diarios-ver-prestamo"
                  style={{ fontSize: "inherit" }}
                >
                  Ver préstamo
                </Link>
              </>
            )}
          </div>
          {item.tipo === "no_pago" && item.motivoNoPago && (
            <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
              Motivo: {item.motivoNoPago}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.4rem",
          }}
        >
          <span style={{ fontWeight: 600 }}>{monto}</span>
          {esAnulableEnPeriodo && (
            <button type="button" className="pagos-diarios-btn-anular" onClick={() => onAnular(item)}>
              Anular
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
