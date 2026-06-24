"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getEmpresa } from "@/lib/empresa";
import {
  usePagosDiariosAdmin,
  type PagoDiarioAdminItem,
} from "@/hooks/usePagosDiariosAdmin";
import {
  fechaDiaCalendarioDesdeISO,
  fechaDiaColombiaHoy,
} from "@/lib/colombia-day-bounds";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelTipo(item: PagoDiarioAdminItem): string {
  if (item.tipo === "no_pago") return "No pagó";
  if (item.tipo === "perdida") return "Pérdida";
  return "Cobro";
}

function labelMetodo(metodo: string | null): string {
  if (!metodo) return "—";
  if (metodo === "transferencia") return "Transferencia";
  if (metodo === "efectivo") return "Efectivo";
  return metodo;
}

function labelRegistrador(item: PagoDiarioAdminItem): string {
  if (item.registradoPorNombre?.trim()) return item.registradoPorNombre.trim();
  if (item.cobradoPorRol === "admin") return "Administrador";
  return "Trabajador";
}

function formatFechaImpresion(fechaDia: string): string {
  return new Date(`${fechaDia}T12:00:00`).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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

export default function PagosDiariosPage() {
  const { user, profile } = useAuth();
  const [fecha, setFecha] = useState(fechaDiaColombiaHoy);
  const { pagos, totales, loading, error, fechaHoy } = usePagosDiariosAdmin(fecha);
  const [modal, setModal] = useState<EstadoModal>({ abierto: false });
  const [nombreEmpresa, setNombreEmpresa] = useState("");

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

  const cobros = useMemo(() => pagos.filter((p) => p.tipo === "pago"), [pagos]);
  const otros = useMemo(() => pagos.filter((p) => p.tipo !== "pago"), [pagos]);

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
          body: JSON.stringify({ motivo: motivo.trim() }),
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

  if (!profile || profile.role !== "admin") return null;

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
            <p className="no-print" style={{ margin: 0, opacity: 0.75, fontSize: "0.95rem" }}>
              Todos los movimientos registrados en el día. Se actualiza en tiempo real.
            </p>
          </div>
          <button
            type="button"
            onClick={imprimirPagos}
            disabled={loading || pagos.length === 0}
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
            <span style={{ marginLeft: "0.5rem" }}>— {formatFechaImpresion(fecha)}</span>
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            Generado:{" "}
            {new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}
          </div>
        </div>

        <div
          className="no-print"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="input"
              style={{ minWidth: "10rem" }}
            />
          </label>
        </div>

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
            valor={formatMonto(totales.totalCobros)}
            sub={`${totales.countCobros} registro(s)`}
          />
          <TarjetaResumen label="Efectivo" valor={formatMonto(totales.totalEfectivo)} />
          <TarjetaResumen
            label="Transferencia"
            valor={formatMonto(totales.totalTransferencia)}
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
        ) : (
          <>
            <section style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Cobros</h3>
              {cobros.length === 0 ? (
                <p style={{ opacity: 0.75, margin: 0 }}>Sin cobros este día.</p>
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
                      fechaHoy={fechaHoy}
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
                      fechaHoy={fechaHoy}
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
        <ModalAnulacion
          item={modal.item}
          motivo={modal.motivo}
          confirmacionMarcada={modal.confirmacionMarcada}
          cargando={modal.cargando}
          errorModal={modal.errorModal}
          onMotivoChange={(v) =>
            setModal((prev) => (prev.abierto ? { ...prev, motivo: v } : prev))
          }
          onConfirmacionMarcadaChange={(marcada) =>
            setModal((prev) =>
              prev.abierto ? { ...prev, confirmacionMarcada: marcada } : prev
            )
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
  fechaHoy,
  onAnular,
}: {
  item: PagoDiarioAdminItem;
  fechaHoy: string;
  onAnular: (item: PagoDiarioAdminItem) => void;
}) {
  const anulado = item.estado === "anulado";

  const esAnulableHoy =
    item.tipo === "pago" &&
    !anulado &&
    item.fecha !== null &&
    fechaDiaCalendarioDesdeISO(item.fecha) === fechaHoy;

  const monto =
    item.tipo === "pago"
      ? formatMonto(item.monto)
      : item.tipo === "perdida"
        ? formatMonto(item.monto)
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
            {item.rutaNombre} · {formatHora(item.fecha)} · {labelTipo(item)}
            {item.tipo === "pago" && ` · ${labelMetodo(item.metodoPago)}`}
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.65 }}>
            Por {labelRegistrador(item)}
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
          {esAnulableHoy && (
            <button type="button" className="pagos-diarios-btn-anular" onClick={() => onAnular(item)}>
              Anular
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ModalAnulacion({
  item,
  motivo,
  confirmacionMarcada,
  cargando,
  errorModal,
  onMotivoChange,
  onConfirmacionMarcadaChange,
  onConfirmar,
  onCerrar,
}: {
  item: PagoDiarioAdminItem;
  motivo: string;
  confirmacionMarcada: boolean;
  cargando: boolean;
  errorModal: string | null;
  onMotivoChange: (v: string) => void;
  onConfirmacionMarcadaChange: (marcada: boolean) => void;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <div
      className="modal-confirmar-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-anulacion-titulo"
      style={{ zIndex: 1200 }}
    >
      <div
        className="modal-confirmar-backdrop"
        aria-hidden
        onClick={() => {
          if (!cargando) onCerrar();
        }}
      />
      <div className="modal-confirmar-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-confirmar-titulo" id="modal-anulacion-titulo">
          Anular cobro
        </h3>

        <div className="pagos-diarios-anular-resumen">
          <div>
            <strong>Cliente:</strong> {item.clienteNombre}
          </div>
          <div>
            <strong>Monto:</strong> {formatMonto(item.monto)}
          </div>
          <div>
            <strong>Método:</strong> {labelMetodo(item.metodoPago)}
          </div>
          <div>
            <strong>Hora:</strong> {formatHora(item.fecha)}
          </div>
          <div>
            <strong>Ruta:</strong> {item.rutaNombre}
          </div>
          <div className="pagos-diarios-anular-resumen-aviso">
            El saldo pendiente del préstamo aumentará en{" "}
            <strong>{formatMonto(item.monto)}</strong>.
          </div>
          {item.metodoPago === "transferencia" && (
            <div className="pagos-diarios-anular-resumen-nota">
              La evidencia de transferencia quedará en el historial del préstamo.
            </div>
          )}
        </div>

        <label className="pagos-diarios-anular-label">
          <span>Motivo de anulación (opcional)</span>
          <textarea
            className="pagos-diarios-anular-textarea"
            value={motivo}
            onChange={(e) => onMotivoChange(e.target.value)}
            disabled={cargando}
            placeholder="Describe el motivo de la anulación (opcional)"
            rows={3}
          />
        </label>

        <label className="modal-confirmar-checkbox-label">
          <input
            type="checkbox"
            checked={confirmacionMarcada}
            disabled={cargando}
            onChange={(e) => onConfirmacionMarcadaChange(e.target.checked)}
          />
          <span>
            Confirmo que deseo <strong>anular este cobro</strong> y entiendo que se revertirá
            el saldo del préstamo y los movimientos asociados.
          </span>
        </label>

        {errorModal && (
          <p role="alert" className="pagos-diarios-anular-error">
            {errorModal}
          </p>
        )}

        <div className="modal-confirmar-actions">
          <button
            type="button"
            onClick={onCerrar}
            disabled={cargando}
            className="btn btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!confirmacionMarcada || cargando}
            className="btn btn-danger"
          >
            {cargando ? "Anulando…" : "Confirmar anulación"}
          </button>
        </div>
      </div>
    </div>
  );
}
