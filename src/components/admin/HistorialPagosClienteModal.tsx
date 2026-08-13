"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOnline, OFFLINE_MSG } from "@/hooks/useOnline";
import {
  listHistorialPagosCliente,
  formatClienteCodigoRutaYNumero,
  type PagoHistorialClienteItem,
} from "@/lib/empresa-api";
import {
  getHistorialPagosCache,
  setHistorialPagosCache,
  clearHistorialPagosCache,
} from "@/lib/historial-pagos-cache";
import { MOTIVOS_NO_PAGO, formatCurrencyCobro } from "@/lib/cobrar-utils";

/** Cliente mínimo necesario para consultar y titular el historial. */
export type ClienteHistorialRef = {
  id: string;
  nombre: string;
  codigo?: string | null;
};

/** Fecha legible para el historial de pagos (o "—" si no hay fecha). */
function formatFechaHistorial(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Etiqueta del tipo de movimiento de un pago. */
function labelTipoPago(p: PagoHistorialClienteItem): string {
  if (p.tipo === "perdida") return "Pérdida";
  if (p.tipo === "no_pago") {
    const motivo = p.motivoNoPago
      ? MOTIVOS_NO_PAGO.find((m) => m.value === p.motivoNoPago)?.label ?? p.motivoNoPago
      : null;
    return motivo ? `No pagó — ${motivo}` : "No pagó";
  }
  return p.metodoPago === "transferencia" ? "Transferencia" : "Efectivo";
}

/**
 * Modal con el historial de pagos COMPLETO de un cliente (todos sus préstamos,
 * incluido el activo). Se cachea en localStorage: la primera vez consulta al
 * servidor y las siguientes se sirve desde caché. "Actualizar" fuerza un refresco.
 */
export function HistorialPagosClienteModal({
  cliente,
  onCerrar,
}: {
  cliente: ClienteHistorialRef;
  onCerrar: () => void;
}) {
  const { user } = useAuth();
  const online = useOnline();
  const [pagos, setPagos] = useState<PagoHistorialClienteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desdeCache, setDesdeCache] = useState(false);

  const cargar = useCallback(
    async (forzar: boolean) => {
      if (!user) return;
      if (!forzar) {
        const cache = getHistorialPagosCache(cliente.id);
        if (cache) {
          setPagos(cache);
          setDesdeCache(true);
          setError(null);
          setLoading(false);
          return;
        }
      }
      if (!online) {
        setError(OFFLINE_MSG);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setDesdeCache(false);
      try {
        const token = await user.getIdToken();
        const res = await listHistorialPagosCliente(token, cliente.id);
        setPagos(res);
        setHistorialPagosCache(cliente.id, res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el historial");
        setPagos([]);
      } finally {
        setLoading(false);
      }
    },
    [user, online, cliente.id]
  );

  useEffect(() => {
    setPagos([]);
    setError(null);
    setDesdeCache(false);
    void cargar(false);
  }, [cargar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const recargar = useCallback(() => {
    clearHistorialPagosCache(cliente.id);
    void cargar(true);
  }, [cargar, cliente.id]);

  return (
    <div className="gf-modal-backdrop" onClick={onCerrar} role="presentation">
      <div
        className="gf-modal gf-modal--cliente-historial"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cliente-historial-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-hist-header">
          <div>
            <h2
              id="cliente-historial-modal-title"
              className="gf-modal-title"
              style={{ marginBottom: "0.15rem" }}
            >
              Historial de pagos
            </h2>
            <p className="admin-hist-cliente">
              {cliente.nombre}
              {cliente.codigo
                ? ` · ${formatClienteCodigoRutaYNumero(cliente.codigo)}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary admin-hist-refresh"
            onClick={recargar}
            disabled={loading || !online}
            title="Volver a consultar en el servidor"
          >
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        {desdeCache && !loading && !error ? (
          <p className="admin-hist-cache-hint">
            Mostrando datos guardados. Pulsa «Actualizar» para refrescar.
          </p>
        ) : null}

        {loading ? (
          <p className="admin-hist-estado">Cargando historial…</p>
        ) : error ? (
          <p className="error-msg">{error}</p>
        ) : pagos.length === 0 ? (
          <p className="admin-hist-estado">Este cliente no tiene pagos registrados.</p>
        ) : (
          <ul className="admin-hist-ul">
            {pagos.map((p, idx) => (
              <li key={p.id || `${p.prestamoId}-${idx}`} className="admin-hist-li">
                <span className="admin-hist-fecha">{formatFechaHistorial(p.fecha)}</span>
                <span className="admin-hist-monto">{formatCurrencyCobro(p.monto)}</span>
                <span
                  className="admin-hist-tipo"
                  style={{
                    color:
                      p.tipo === "perdida"
                        ? "var(--danger, #f87171)"
                        : p.tipo === "no_pago"
                          ? "var(--warning, #eab308)"
                          : "inherit",
                  }}
                >
                  {labelTipoPago(p)}
                </span>
                <span className="admin-hist-registrado" title="Registrado por">
                  {p.registradoPorNombre || p.registradoPorUid || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="gf-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
