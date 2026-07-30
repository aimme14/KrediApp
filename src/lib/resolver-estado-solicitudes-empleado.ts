export type EstadoSolicitudEntregaUi = "pendiente" | "aprobada" | "rechazada";

type SolicitudConCreadaEn = {
  estado: EstadoSolicitudEntregaUi;
  creadaEn: Date | null;
};

/**
 * Toma la solicitud más reciente (`creadaEn`) y deriva el estado visible:
 * - pendiente → en curso
 * - rechazada → mostrar ese rechazo
 * - aprobada → no mostrar rechazo viejo
 */
export function resolverEstadoSolicitudesEmpleado<T extends SolicitudConCreadaEn>(
  solicitudes: T[]
): { pendiente: T | null; ultimaRechazada: T | null; masReciente: T | null } {
  if (solicitudes.length === 0) {
    return { pendiente: null, ultimaRechazada: null, masReciente: null };
  }

  const masReciente = [...solicitudes].sort(
    (a, b) => (b.creadaEn?.getTime() ?? 0) - (a.creadaEn?.getTime() ?? 0)
  )[0];

  if (masReciente.estado === "pendiente") {
    return { pendiente: masReciente, ultimaRechazada: null, masReciente };
  }
  if (masReciente.estado === "rechazada") {
    return { pendiente: null, ultimaRechazada: masReciente, masReciente };
  }
  return { pendiente: null, ultimaRechazada: null, masReciente };
}
