"use client";

import Link from "next/link";
import { useTrabajadorCajaDia } from "@/context/TrabajadorCajaDiaContext";
import { tuCajaDelDiaDesdeTotales } from "@/lib/tu-caja-del-dia";

function formatMonto(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function TrabajadorInicioCajaDelDia() {
  const { fechaDia, data, loading, error } = useTrabajadorCajaDia();
  const fechaEtiqueta = data?.fechaDia ?? fechaDia;
  const monto =
    data != null
      ? data.tuCajaDelDia ?? tuCajaDelDiaDesdeTotales(data)
      : null;

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
      ) : loading && monto == null ? (
        <span className="trabajador-inicio-caja-valor trabajador-inicio-caja-valor-muted">
          Cargando…
        </span>
      ) : (
        <span className="trabajador-inicio-caja-valor">
          {formatMonto(typeof monto === "number" ? monto : 0)}
        </span>
      )}
    </Link>
  );
}
