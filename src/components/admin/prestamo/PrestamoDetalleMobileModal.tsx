"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { PrestamoItem } from "@/lib/empresa-api";
import { formatClienteCodigoRutaYNumero } from "@/lib/empresa-api";
import { fechaRelevantePrestamo, calcularDuracionDias } from "@/lib/prestamo-display";
import { isPrestamoEnCobro, labelEstadoPrestamo } from "@/lib/prestamo-estado";
import { formatMonedaPrestamoAdmin } from "@/lib/prestamo-admin-format";
import type { PrestamoFiltroEstado } from "@/lib/prestamo-periodo-filter";

function cuotasPagadas(totalAPagar: number, numeroCuotas: number, saldoPendiente: number): number {
  if (totalAPagar <= 0 || numeroCuotas <= 0) return 0;
  if (saldoPendiente <= 0) return numeroCuotas;
  const cuotaUnit = totalAPagar / numeroCuotas;
  const pagado = totalAPagar - saldoPendiente;
  return Math.min(numeroCuotas, Math.round(pagado / cuotaUnit));
}

function prestamoEstadoBadgeClass(estado: string): string {
  if (estado === "activo" || estado === "pagado" || estado === "castigado") {
    return ` prestamo-admin-estado--${estado}`;
  }
  return "";
}

function labelCuotas(p: PrestamoItem): string {
  if (p.estado === "castigado") return "—";
  if (p.estado === "pagado") {
    return calcularDuracionDias(p.fechaInicio, p.fechaCierre);
  }
  const pagadas = cuotasPagadas(p.totalAPagar, p.numeroCuotas, p.saldoPendiente);
  return `${pagadas} / ${p.numeroCuotas}`;
}

function labelSaldo(p: PrestamoItem, filtroEstado: PrestamoFiltroEstado): string {
  if (filtroEstado === "castigado" || p.estado === "castigado") {
    return `$ ${formatMonedaPrestamoAdmin(p.cobradoAcumulado ?? 0)}`;
  }
  if (filtroEstado === "pagado" || p.estado === "pagado") {
    return formatMonedaPrestamoAdmin(p.totalAPagar);
  }
  return formatMonedaPrestamoAdmin(p.saldoPendiente);
}

function tituloSaldo(filtroEstado: PrestamoFiltroEstado, p: PrestamoItem): string {
  if (filtroEstado === "castigado" || p.estado === "castigado") return "Cobrado";
  if (filtroEstado === "pagado" || p.estado === "pagado") return "Total pagado";
  return "Saldo";
}

type Props = {
  prestamo: PrestamoItem;
  clienteId: string;
  nombre: string;
  codigo: string | null;
  filtroEstado: PrestamoFiltroEstado;
  otrosPrestamos?: PrestamoItem[];
  onHistorial?: () => void;
  onCerrar: () => void;
};

function DetalleGrid({
  p,
  filtroEstado,
}: {
  p: PrestamoItem;
  filtroEstado: PrestamoFiltroEstado;
}) {
  return (
    <dl className="prestamo-detalle-grid">
      <div className="prestamo-detalle-row">
        <dt>Fecha</dt>
        <dd>{fechaRelevantePrestamo(p)}</dd>
      </div>
      <div className="prestamo-detalle-row">
        <dt>Monto</dt>
        <dd>{formatMonedaPrestamoAdmin(p.monto)}</dd>
      </div>
      {p.estado !== "pagado" && p.estado !== "castigado" && (
        <div className="prestamo-detalle-row">
          <dt>Total a pagar</dt>
          <dd>{formatMonedaPrestamoAdmin(p.totalAPagar)}</dd>
        </div>
      )}
      <div className="prestamo-detalle-row">
        <dt>{tituloSaldo(filtroEstado, p)}</dt>
        <dd>{labelSaldo(p, filtroEstado)}</dd>
      </div>
      <div className="prestamo-detalle-row">
        <dt>Cuotas</dt>
        <dd>{labelCuotas(p)}</dd>
      </div>
      <div className="prestamo-detalle-row">
        <dt>Estado</dt>
        <dd>
          <span className={`prestamo-admin-estado${prestamoEstadoBadgeClass(p.estado)}`}>
            {labelEstadoPrestamo(p)}
          </span>
        </dd>
      </div>
      <div className="prestamo-detalle-row">
        <dt>Frecuencia</dt>
        <dd>{p.modalidad}</dd>
      </div>
    </dl>
  );
}

export default function PrestamoDetalleMobileModal({
  prestamo,
  clienteId,
  nombre,
  codigo,
  filtroEstado,
  otrosPrestamos = [],
  onHistorial,
  onCerrar,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const codigoDisplay = codigo ? formatClienteCodigoRutaYNumero(codigo) : null;

  return (
    <div
      className="gf-modal-backdrop gf-modal-backdrop--prestamo-detalle"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        className="gf-modal gf-modal--prestamo-detalle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prestamo-detalle-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prestamo-detalle-handle" aria-hidden />

        <h2 id="prestamo-detalle-modal-title" className="gf-modal-title">
          {nombre}
        </h2>
        {codigoDisplay && (
          <p className="prestamo-detalle-codigo">{codigoDisplay}</p>
        )}

        <DetalleGrid p={prestamo} filtroEstado={filtroEstado} />

        {otrosPrestamos.length > 0 && (
          <section className="prestamo-detalle-otros">
            <h3 className="prestamo-detalle-otros-title">
              Otros préstamos ({otrosPrestamos.length})
            </h3>
            {otrosPrestamos.map((p) => (
              <div key={p.id} className="prestamo-detalle-otros-item">
                <DetalleGrid p={p} filtroEstado={filtroEstado} />
              </div>
            ))}
          </section>
        )}

        <div className="prestamo-detalle-actions">
          {isPrestamoEnCobro(prestamo) && (
            <Link
              href={`/dashboard/admin/cobrar?clienteId=${clienteId}&prestamoId=${prestamo.id}`}
              className="btn btn-primary prestamo-detalle-cobrar-btn"
            >
              Cobrar
            </Link>
          )}
          {onHistorial && (
            <button type="button" className="btn btn-secondary" onClick={onHistorial}>
              Historial
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
