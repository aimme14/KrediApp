"use client";

import Link from "next/link";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function TrabajadorInicioCajaDelDia() {
  const { fechaDia, data, loading, error, cajaEmpleadoRT } = useTrabajadorCajaDia();
  const fechaEtiqueta = data?.fechaDia ?? fechaDia;
  const cajaActual = cajaEmpleadoRT ?? data?.cajaEmpleado ?? null;

  return (
    <Link
      href="/dashboard/trabajador/caja-del-dia"
      className="trabajador-inicio-caja-card"
      aria-label="Ver detalle de tu caja del día"
    >
      <span className="trabajador-inicio-caja-label">
        TU CAJA DEL DÍA ({fechaEtiqueta})
      </span>
      {error ? (
        <span className="trabajador-inicio-caja-valor trabajador-inicio-caja-valor-muted">
          No disponible
        </span>
      ) : loading && cajaActual == null ? (
        <span className="trabajador-inicio-caja-valor trabajador-inicio-caja-valor-muted">
          Cargando…
        </span>
      ) : (
        <span className="trabajador-inicio-caja-valor">
          {formatMonto(typeof cajaActual === "number" ? cajaActual : 0)}
        </span>
      )}
    </Link>
  );
}
