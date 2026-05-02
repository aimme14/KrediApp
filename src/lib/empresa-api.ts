/**
 * Cliente para las APIs de empresa (rutas, clientes, préstamos, gastos).
 * Requiere el token de Firebase para autorización.
 */

export type RutaItem = {
  id: string;
  nombre: string;
  ubicacion: string;
  base: string;
  descripcion: string;
  adminId: string;
  empleadoId: string;
  fechaCreacion: string | null;
  /** Código legible (ej. RT-001-002). Id técnico sigue siendo id. */
  codigo?: string;
  /** Efectivo operable en la ruta (base para prestar / mover). */
  cajaRuta?: number;
  /** Efectivo asignado a empleados (cajas de trabajadores en ruta). */
  cajasEmpleados?: number;
  /** Capital colocado en préstamos (inversión). */
  inversiones?: number;
  /** Intereses / ganancias acumuladas. */
  ganancias?: number;
  /** Patrimonio total de la ruta (caja ruta + bases empleados + inversiones − pérdidas). */
  capitalTotal?: number;
  /** false = trabajadores no pueden cobrar hasta que el admin abra la ruta (manual). */
  rutaOperativa?: boolean;
};

export type ClienteItem = {
  id: string;
  nombre: string;
  ubicacion: string;
  direccion: string;
  telefono: string;
  cedula: string;
  rutaId: string;
  adminId: string;
  prestamo_activo: boolean;
  moroso?: boolean;
  fechaCreacion: string | null;
  /** Código legible (ej. CL-001-002-045). Id técnico sigue siendo id. */
  codigo?: string;
};

/**
 * Para admin/trabajador: código corto CL-{ruta}-{cliente} (ej. CL-002-045).
 * Para jefe conviene mostrar el codigo completo (CL-001-002-045).
 */
export function formatClienteCodigoCorto(codigo: string | undefined): string {
  if (!codigo || typeof codigo !== "string") return "—";
  const m = codigo.match(/^CL-(\d+)-(\d+)-(\d+)$/);
  if (!m) return codigo;
  return `CL-${m[2]}-${m[3]}`;
}

/**
 * Extrae las últimas tres cifras del código de cliente (número dentro de la ruta).
 * Ej: clienteNumFromCodigo("CL-001-002-045") → "045"
 */
export function clienteNumFromCodigo(codigo: string | undefined): string {
  if (!codigo || typeof codigo !== "string") return "";
  const m = codigo.match(/^CL-\d+-\d+-(\d+)$/);
  return m ? m[1] : "";
}

export type PrestamoItem = {
  id: string;
  clienteId: string;
  rutaId: string;
  adminId: string;
  empleadoId: string;
  monto: number;
  interes: number;
  modalidad: string;
  numeroCuotas: number;
  totalAPagar: number;
  saldoPendiente: number;
  estado: string;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  multaMora: number;
  /** Adelanto aplicado a la(s) siguiente(s) cuota(s). La próxima sugerencia es valorCuota - (adelanto % valorCuota). */
  adelantoCuota?: number;
  /** Fecha del último pago (ISO). Para semáforo "cuota del día pagada" en ruta del día. */
  ultimoPagoFecha?: string | null;
  /** No pagos consecutivos registrados (sin pago). A las 3 pasará el préstamo a mora. */
  intentosFallidos?: number;
};

export type GastoItem = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: string | null;
  tipo: string;
  creadoPor: string;
  /** Nombre de quien registró el gasto (solo en listado para admin) */
  creadoPorNombre?: string;
  rol: string;
  rutaId: string;
  adminId: string;
  empleadoId: string;
  evidencia: string;
  /** empresa | admin | ruta | empleado (según subcolección / legacy) */
  alcance?: string;
};

/** Item de la subcolección pagos de un préstamo (historial de cobros / no pago / pérdida). */
export type PagoItem = {
  id: string;
  monto: number;
  fecha: string | null;
  tipo: "pago" | "no_pago" | "perdida";
  metodoPago: string | null;
  motivoPerdida?: string | null;
  registradoPorUid: string | null;
  registradoPorNombre: string | null;
};

async function fetchWithAuth(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

/** Evita el error críptico «Unexpected token '<'» cuando el servidor devuelve HTML en lugar de JSON. */
async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const looksHtml = text.trimStart().startsWith("<");
    throw new Error(
      looksHtml
        ? `Respuesta inválida (${res.status}): el servidor envió HTML en lugar de JSON. Revisa la terminal donde corre «next dev».`
        : `Respuesta inválida (${res.status}): ${text.slice(0, 180)}`
    );
  }
}

export async function listRutas(
  token: string,
  options?: { sinEmpleado?: boolean }
): Promise<RutaItem[]> {
  const params = new URLSearchParams();
  if (options?.sinEmpleado) params.set("sinEmpleado", "true");
  const qs = params.toString();
  const url = qs ? `/api/empresa/rutas?${qs}` : "/api/empresa/rutas";
  const res = await fetchWithAuth(url, token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar rutas");
  return data.rutas ?? [];
}

/** Rutas del administrador para la vista «ruta del día». */
export type RutaDelDiaEmpleadoItem = {
  uid: string;
  nombre: string;
};

export type RutaDelDiaItem = {
  id: string;
  nombre: string;
  codigo?: string;
  ubicacion: string;
  cajaRuta: number;
  empleados: RutaDelDiaEmpleadoItem[];
};

export async function getRutaDelDia(token: string): Promise<RutaDelDiaItem[]> {
  const res = await fetchWithAuth("/api/empresa/ruta-del-dia", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar ruta del día");
  return data.rutas ?? [];
}

/** Pasa efectivo de la base de la ruta a la caja del trabajador (`cajaEmpleado`). */
export async function asignarBaseEmpleadoDesdeRuta(
  token: string,
  rutaId: string,
  params: { empleadoUid: string; monto: number }
): Promise<{ cajaRuta: number; cajasEmpleados: number; baseTrabajador: number }> {
  const res = await fetchWithAuth(
    `/api/empresa/rutas/${encodeURIComponent(rutaId)}/asignar-base-empleado`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        empleadoUid: params.empleadoUid,
        monto: params.monto,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al asignar base");
  return data;
}

/** Admin: abre o cierra manualmente la operación del día para los trabajadores de la ruta. */
export async function patchRutaOperativa(
  token: string,
  rutaId: string,
  rutaOperativa: boolean
): Promise<void> {
  const res = await fetchWithAuth(`/api/empresa/rutas/${encodeURIComponent(rutaId)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ rutaOperativa }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Error al actualizar la ruta");
}

export type SolicitudEntregaReporteApi = {
  id: string;
  empleadoUid: string;
  empleadoNombre: string;
  rutaId: string;
  rutaNombre: string;
  adminId: string;
  estado: string;
  comentarioTrabajador: string | null;
  montoAlSolicitar: number;
  creadaEn: string | null;
  resueltaEn: string | null;
  resueltaPorUid: string | null;
  motivoRechazo: string | null;
  montoEntregadoEfectivo: number | null;
};

/**
 * Trabajador: solicita entregar el reporte (el admin debe aprobar para que el efectivo pase a la base de la ruta).
 */
export async function solicitarEntregaReporteDia(
  token: string,
  options?: { comentario?: string }
): Promise<{
  solicitudId: string;
  montoAlSolicitar: number;
  rutaId: string;
  mensaje: string;
}> {
  const body: Record<string, string> = {};
  if (options?.comentario !== undefined) {
    body.comentario = options.comentario;
  }
  const res = await fetchWithAuth("/api/empresa/empleado/entregar-reporte", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al solicitar entrega de reporte");
  return {
    solicitudId: data.solicitudId ?? "",
    montoAlSolicitar: typeof data.montoAlSolicitar === "number" ? data.montoAlSolicitar : 0,
    rutaId: data.rutaId ?? "",
    mensaje: typeof data.mensaje === "string" ? data.mensaje : "",
  };
}

export async function getMiSolicitudEntregaReporte(token: string): Promise<{
  pendiente: SolicitudEntregaReporteApi | null;
  ultimaRechazada: SolicitudEntregaReporteApi | null;
}> {
  const res = await fetchWithAuth("/api/empresa/empleado/mi-solicitud-reporte", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar solicitud");
  return {
    pendiente: data.pendiente ?? null,
    ultimaRechazada: data.ultimaRechazada ?? null,
  };
}

export type SolicitudEntregaPendienteAdmin = {
  id: string;
  empleadoUid: string;
  empleadoNombre: string;
  rutaId: string;
  rutaNombre: string;
  estado: string;
  comentarioTrabajador: string | null;
  montoAlSolicitar: number;
  creadaEn: string | null;
};

export async function getSolicitudesEntregaReportePendientes(
  token: string
): Promise<SolicitudEntregaPendienteAdmin[]> {
  const res = await fetchWithAuth("/api/empresa/solicitudes-entrega-reporte", token);
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error ?? "Error al cargar solicitudes"));
  return Array.isArray(data.solicitudes) ? data.solicitudes : [];
}

export async function aprobarSolicitudEntregaReporte(
  token: string,
  solicitudId: string
): Promise<{ monto: number; rutaId: string; reporteDiaId: string }> {
  const res = await fetchWithAuth(
    `/api/empresa/solicitudes-entrega-reporte/${encodeURIComponent(solicitudId)}/aprobar`,
    token,
    { method: "POST", body: "{}" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al aprobar");
  return {
    monto: typeof data.monto === "number" ? data.monto : 0,
    rutaId: data.rutaId ?? "",
    reporteDiaId: data.reporteDiaId ?? "",
  };
}

export async function rechazarSolicitudEntregaReporte(
  token: string,
  solicitudId: string,
  options?: { motivo?: string }
): Promise<void> {
  const res = await fetchWithAuth(
    `/api/empresa/solicitudes-entrega-reporte/${encodeURIComponent(solicitudId)}/rechazar`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ motivo: options?.motivo ?? "" }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Error al rechazar");
}

export type CobroDiaItem = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  metodoPago: string | null;
  fecha: string | null;
  /** Total del préstamo (`totalAPagar`). */
  totalAPagar: number;
  saldoPendienteTrasPago: number;
  saldoPendientePrestamoActual: number;
  /** Estimado con cuotas iguales. */
  cuotasFaltantes: number;
  numeroCuotas: number;
};

/** Registros «no pagó» que el trabajador confirmó ese día (ruta del empleado). */
export type NoPagoDiaItem = {
  pagoId: string;
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  fecha: string | null;
  motivoNoPago: string;
  nota: string | null;
  saldoPendientePrestamoActual: number;
  totalAPagar: number;
  numeroCuotas: number;
  cuotasPendientes: number;
};

export type GastoDiaItem = {
  id: string;
  monto: number;
  descripcion: string;
  fecha: string | null;
  motivo: string;
};

export type PrestamoDesembolsoDiaItem = {
  prestamoId: string;
  clienteId: string;
  clienteNombre: string;
  monto: number;
  fecha: string | null;
  totalAPagar: number;
};

export type CobrosDelDiaEmpleadoResponse = {
  fechaDia: string;
  rutaId: string;
  cobros: CobroDiaItem[];
  noPagos: NoPagoDiaItem[];
  totalCobrosLista: number;
  /** Total cobrado en ruta + base − gastos − préstamos desde tu caja (tarjeta «Tu caja del día»). */
  tuCajaDelDia: number;
  /** Cobros del día que por reglas de negocio ingresan a tu billetera (titular del préstamo o cobrador si no hay titular). */
  totalCobrosAcreditanTuCaja: number;
  totalGastosDia: number;
  gastosDelDia: GastoDiaItem[];
  /** Suma de traspasos base ruta → tu caja ese día (`asignacionesBase`). */
  totalBaseAsignadaDia: number;
  prestamosDesembolsoDelDia: PrestamoDesembolsoDiaItem[];
  totalPrestamosDesembolsoDia: number;
};

/** Admin: vista previa del cierre (misma data que cobros del día del trabajador). Solo solicitudes pendientes. */
export async function getPreviewEntregaReporteAdmin(
  token: string,
  solicitudId: string
): Promise<{
  fechaDiaPreview: string;
  solicitud: {
    id: string;
    empleadoNombre: string;
    rutaNombre: string;
    rutaId: string;
    montoAlSolicitar: number;
    comentarioTrabajador: string | null;
  };
  snapshot: CobrosDelDiaEmpleadoResponse;
}> {
  const res = await fetchWithAuth(
    `/api/empresa/solicitudes-entrega-reporte/${encodeURIComponent(solicitudId)}/preview`,
    token
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar la vista previa");
  const gastosPrevRaw = Array.isArray(data.snapshot?.gastosDelDia) ? data.snapshot.gastosDelDia : [];
  const gastosDelDiaPreview: GastoDiaItem[] = gastosPrevRaw.map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    monto: typeof row.monto === "number" ? row.monto : 0,
    descripcion: typeof row.descripcion === "string" ? row.descripcion : "",
    fecha: typeof row.fecha === "string" ? row.fecha : null,
    motivo: typeof row.motivo === "string" ? row.motivo : "—",
  }));
  const prestamosPrevRaw = Array.isArray(data.snapshot?.prestamosDesembolsoDelDia)
    ? data.snapshot.prestamosDesembolsoDelDia
    : [];
  const prestamosDesembolsoDelDia: PrestamoDesembolsoDiaItem[] = prestamosPrevRaw.map(
    (row: Record<string, unknown>) => ({
      prestamoId: String(row.prestamoId ?? ""),
      clienteId: String(row.clienteId ?? ""),
      clienteNombre: String(row.clienteNombre ?? ""),
      monto: typeof row.monto === "number" ? row.monto : 0,
      fecha: typeof row.fecha === "string" ? row.fecha : null,
      totalAPagar: typeof row.totalAPagar === "number" ? row.totalAPagar : 0,
    })
  );

  return {
    fechaDiaPreview: data.fechaDiaPreview ?? "",
    solicitud: data.solicitud ?? {},
    snapshot: {
      fechaDia: data.snapshot?.fechaDia ?? "",
      rutaId: data.snapshot?.rutaId ?? "",
      cobros: Array.isArray(data.snapshot?.cobros) ? data.snapshot.cobros : [],
      noPagos: Array.isArray(data.snapshot?.noPagos) ? data.snapshot.noPagos : [],
      totalCobrosLista: typeof data.snapshot?.totalCobrosLista === "number" ? data.snapshot.totalCobrosLista : 0,
      tuCajaDelDia: typeof data.snapshot?.tuCajaDelDia === "number" ? data.snapshot.tuCajaDelDia : 0,
      totalCobrosAcreditanTuCaja:
        typeof data.snapshot?.totalCobrosAcreditanTuCaja === "number"
          ? data.snapshot.totalCobrosAcreditanTuCaja
          : 0,
      totalGastosDia: typeof data.snapshot?.totalGastosDia === "number" ? data.snapshot.totalGastosDia : 0,
      gastosDelDia: gastosDelDiaPreview,
      totalBaseAsignadaDia:
        typeof data.snapshot?.totalBaseAsignadaDia === "number" ? data.snapshot.totalBaseAsignadaDia : 0,
      prestamosDesembolsoDelDia,
      totalPrestamosDesembolsoDia:
        typeof data.snapshot?.totalPrestamosDesembolsoDia === "number"
          ? data.snapshot.totalPrestamosDesembolsoDia
          : 0,
    },
  };
}

/** Admin: URL firmada (corta) para descargar el PDF del reporte. */
export async function getReporteDiaPdfUrl(
  token: string,
  reporteId: string
): Promise<{ url: string; expiresInSeconds: number }> {
  const res = await fetchWithAuth(
    `/api/empresa/reportes-dia/${encodeURIComponent(reporteId)}/pdf`,
    token
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al generar enlace de descarga");
  return {
    url: typeof data.url === "string" ? data.url : "",
    expiresInSeconds: typeof data.expiresInSeconds === "number" ? data.expiresInSeconds : 0,
  };
}

/** Admin: vuelve a generar y sube el PDF (p. ej. tras corregir el generador o un fallo de Storage). */
export async function regenerarReporteDiaPdf(
  token: string,
  reporteId: string
): Promise<void> {
  const res = await fetchWithAuth(
    `/api/empresa/reportes-dia/${encodeURIComponent(reporteId)}/regenerar-pdf`,
    token,
    { method: "POST", body: "{}" }
  );
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "No se pudo regenerar el PDF");
}

export async function getCobrosDelDiaEmpleado(
  token: string,
  fecha?: string
): Promise<CobrosDelDiaEmpleadoResponse> {
  const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
  const res = await fetchWithAuth(`/api/empresa/empleado/cobros-del-dia${qs}`, token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar cobros del día");

  const cobrosRaw = Array.isArray(data.cobros) ? data.cobros : [];
  const cobros: CobroDiaItem[] = cobrosRaw.map((row: Record<string, unknown>) => ({
    pagoId: String(row.pagoId ?? ""),
    prestamoId: String(row.prestamoId ?? ""),
    clienteId: String(row.clienteId ?? ""),
    clienteNombre: String(row.clienteNombre ?? ""),
    monto: typeof row.monto === "number" ? row.monto : 0,
    metodoPago:
      row.metodoPago === "transferencia" || row.metodoPago === "efectivo"
        ? (row.metodoPago as string)
        : null,
    fecha: typeof row.fecha === "string" ? row.fecha : null,
    totalAPagar: typeof row.totalAPagar === "number" ? row.totalAPagar : 0,
    saldoPendienteTrasPago:
      typeof row.saldoPendienteTrasPago === "number" ? row.saldoPendienteTrasPago : 0,
    saldoPendientePrestamoActual:
      typeof row.saldoPendientePrestamoActual === "number"
        ? row.saldoPendientePrestamoActual
        : 0,
    cuotasFaltantes: typeof row.cuotasFaltantes === "number" ? row.cuotasFaltantes : 0,
    numeroCuotas: typeof row.numeroCuotas === "number" ? row.numeroCuotas : 0,
  }));

  const gastosRaw = Array.isArray(data.gastosDelDia) ? data.gastosDelDia : [];
  const gastosDelDia: GastoDiaItem[] = gastosRaw.map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    monto: typeof row.monto === "number" ? row.monto : 0,
    descripcion: typeof row.descripcion === "string" ? row.descripcion : "",
    fecha: typeof row.fecha === "string" ? row.fecha : null,
    motivo: typeof row.motivo === "string" ? row.motivo : "—",
  }));

  const noPagosRaw = Array.isArray(data.noPagos) ? data.noPagos : [];
  const noPagos: NoPagoDiaItem[] = noPagosRaw.map((row: Record<string, unknown>) => ({
    pagoId: String(row.pagoId ?? ""),
    prestamoId: String(row.prestamoId ?? ""),
    clienteId: String(row.clienteId ?? ""),
    clienteNombre: String(row.clienteNombre ?? ""),
    fecha: typeof row.fecha === "string" ? row.fecha : null,
    motivoNoPago: typeof row.motivoNoPago === "string" ? row.motivoNoPago : "",
    nota: typeof row.nota === "string" && row.nota.trim() ? row.nota : null,
    saldoPendientePrestamoActual:
      typeof row.saldoPendientePrestamoActual === "number"
        ? row.saldoPendientePrestamoActual
        : 0,
    totalAPagar: typeof row.totalAPagar === "number" ? row.totalAPagar : 0,
    numeroCuotas: typeof row.numeroCuotas === "number" ? row.numeroCuotas : 0,
    cuotasPendientes: typeof row.cuotasPendientes === "number" ? row.cuotasPendientes : 0,
  }));

  const prestamosRaw = Array.isArray(data.prestamosDesembolsoDelDia)
    ? data.prestamosDesembolsoDelDia
    : [];
  const prestamosDesembolsoDelDia: PrestamoDesembolsoDiaItem[] = prestamosRaw.map(
    (row: Record<string, unknown>) => ({
      prestamoId: String(row.prestamoId ?? ""),
      clienteId: String(row.clienteId ?? ""),
      clienteNombre: String(row.clienteNombre ?? ""),
      monto: typeof row.monto === "number" ? row.monto : 0,
      fecha: typeof row.fecha === "string" ? row.fecha : null,
      totalAPagar: typeof row.totalAPagar === "number" ? row.totalAPagar : 0,
    })
  );

  return {
    fechaDia: data.fechaDia ?? "",
    rutaId: data.rutaId ?? "",
    cobros,
    noPagos,
    totalCobrosLista: typeof data.totalCobrosLista === "number" ? data.totalCobrosLista : 0,
    tuCajaDelDia: typeof data.tuCajaDelDia === "number" ? data.tuCajaDelDia : 0,
    totalCobrosAcreditanTuCaja:
      typeof data.totalCobrosAcreditanTuCaja === "number"
        ? data.totalCobrosAcreditanTuCaja
        : 0,
    totalGastosDia: typeof data.totalGastosDia === "number" ? data.totalGastosDia : 0,
    gastosDelDia,
    totalBaseAsignadaDia:
      typeof data.totalBaseAsignadaDia === "number" ? data.totalBaseAsignadaDia : 0,
    prestamosDesembolsoDelDia,
    totalPrestamosDesembolsoDia:
      typeof data.totalPrestamosDesembolsoDia === "number" ? data.totalPrestamosDesembolsoDia : 0,
  };
}

export type ReporteDiaItem = {
  id: string;
  fechaDia: string;
  rutaId: string;
  rutaNombre: string;
  empleadoId: string;
  empleadoNombre: string;
  montoEntregado: number;
  fecha: string | null;
  /** Nota opcional del trabajador al entregar el reporte */
  comentario?: string | null;
  tienePdf?: boolean;
  pdfError?: string | null;
};

export async function getReportesDia(
  token: string,
  fecha?: string
): Promise<{ fechaDia: string; items: ReporteDiaItem[]; totalMonto: number }> {
  const url = fecha
    ? `/api/empresa/reportes-dia?fecha=${encodeURIComponent(fecha)}`
    : "/api/empresa/reportes-dia";
  const res = await fetchWithAuth(url, token);
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(String(data.error ?? "Error al cargar reportes"));
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: ReporteDiaItem[] = itemsRaw.map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    fechaDia: String(row.fechaDia ?? ""),
    rutaId: String(row.rutaId ?? ""),
    rutaNombre: String(row.rutaNombre ?? ""),
    empleadoId: String(row.empleadoId ?? ""),
    empleadoNombre: String(row.empleadoNombre ?? ""),
    montoEntregado: typeof row.montoEntregado === "number" ? row.montoEntregado : 0,
    fecha: typeof row.fecha === "string" ? row.fecha : null,
    comentario:
      typeof row.comentario === "string" && row.comentario.trim() ? row.comentario : null,
    tienePdf: Boolean(row.tienePdf),
    pdfError:
      typeof row.pdfError === "string" && row.pdfError.trim() ? row.pdfError : null,
  }));

  return {
    fechaDia: typeof data.fechaDia === "string" ? data.fechaDia : "",
    items,
    totalMonto: typeof data.totalMonto === "number" ? data.totalMonto : 0,
  };
}

export async function createRuta(
  token: string,
  params: { nombre: string; ubicacion?: string; capitalInicial?: number }
): Promise<string> {
  const res = await fetchWithAuth("/api/empresa/rutas", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al crear ruta");
  return data.id;
}

export async function listClientes(
  token: string,
  rutaId?: string,
  options?: { moroso?: boolean }
): Promise<ClienteItem[]> {
  const params = new URLSearchParams();
  if (rutaId) params.set("rutaId", rutaId);
  if (options?.moroso) params.set("moroso", "true");
  const url = params.toString() ? `/api/empresa/clientes?${params}` : "/api/empresa/clientes";
  const res = await fetchWithAuth(url, token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar clientes");
  return data.clientes ?? [];
}

export async function createCliente(
  token: string,
  params: {
    nombre: string;
    ubicacion?: string;
    direccion?: string;
    telefono?: string;
    cedula?: string;
    rutaId: string;
  }
): Promise<string> {
  const res = await fetchWithAuth("/api/empresa/clientes", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al crear cliente");
  return data.id;
}

export async function listPrestamos(token: string): Promise<PrestamoItem[]> {
  const res = await fetchWithAuth("/api/empresa/prestamos", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar préstamos");
  return data.prestamos ?? [];
}

/** Lista los últimos pagos de un préstamo (para historial). */
export async function listPagos(token: string, prestamoId: string): Promise<PagoItem[]> {
  const res = await fetchWithAuth(`/api/empresa/prestamos/${encodeURIComponent(prestamoId)}/pagos`, token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar pagos");
  return data.pagos ?? [];
}

/** Registra un pago (cobro) en un préstamo. */
export async function registrarPago(
  token: string,
  prestamoId: string,
  params: {
    monto: number;
    metodoPago: "efectivo" | "transferencia";
    evidencia?: string;
    registradoPorUid?: string;
    registradoPorNombre?: string;
    /** Clave de idempotencia: mismo key = misma respuesta, sin duplicar pago */
    idempotencyKey?: string;
  }
): Promise<{ saldoPendiente: number; adelantoCuota?: number; pagoId?: string }> {
  const res = await fetchWithAuth(`/api/empresa/prestamos/${encodeURIComponent(prestamoId)}/pagos`, token, {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al registrar pago");
  return {
    saldoPendiente: data.saldoPendiente ?? 0,
    adelantoCuota: data.adelantoCuota,
    pagoId: data.pagoId,
  };
}

/** Actualiza el comprobante (URL de la imagen) de un pago. */
export async function actualizarComprobantePago(
  token: string,
  prestamoId: string,
  pagoId: string,
  comprobanteUrl: string
): Promise<void> {
  const res = await fetchWithAuth(
    `/api/empresa/prestamos/${encodeURIComponent(prestamoId)}/pagos/${encodeURIComponent(pagoId)}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ comprobanteUrl }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al guardar comprobante");
}

/** Registra un intento sin pago en la subcolección pagos del préstamo (tipo no_pago). */
export async function registrarNoPago(
  token: string,
  prestamoId: string,
  params: {
    motivoNoPago: string;
    nota?: string;
    registradoPorUid?: string;
    registradoPorNombre?: string;
  }
): Promise<void> {
  const res = await fetchWithAuth(`/api/empresa/prestamos/${encodeURIComponent(prestamoId)}/pagos`, token, {
    method: "POST",
    body: JSON.stringify({
      tipo: "no_pago",
      motivoNoPago: params.motivoNoPago,
      nota: params.nota?.trim() || undefined,
      registradoPorUid: params.registradoPorUid,
      registradoPorNombre: params.registradoPorNombre,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al registrar no pago");
}

/** Registra pérdida reconocida (monto que no se cobrará): ajusta saldo del préstamo y ruta (inversiones → pérdidas). */
export async function registrarPerdida(
  token: string,
  prestamoId: string,
  params: {
    monto: number;
    motivoPerdida: string;
    nota?: string;
    registradoPorUid?: string;
    registradoPorNombre?: string;
  }
): Promise<{ saldoPendiente: number; adelantoCuota?: number }> {
  const res = await fetchWithAuth(`/api/empresa/prestamos/${encodeURIComponent(prestamoId)}/pagos`, token, {
    method: "POST",
    body: JSON.stringify({
      tipo: "perdida",
      monto: params.monto,
      motivoPerdida: params.motivoPerdida,
      nota: params.nota?.trim() || undefined,
      registradoPorUid: params.registradoPorUid,
      registradoPorNombre: params.registradoPorNombre,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al registrar pérdida");
  return {
    saldoPendiente: data.saldoPendiente ?? 0,
    adelantoCuota: data.adelantoCuota,
  };
}

export async function createPrestamo(
  token: string,
  params: {
    clienteId: string;
    rutaId?: string;
    empleadoId?: string;
    monto: number;
    interes?: number;
    modalidad?: "diario" | "semanal" | "mensual";
    numeroCuotas: number;
    fechaInicio?: string;
    multaMora?: number;
  }
): Promise<string> {
  const res = await fetchWithAuth("/api/empresa/prestamos", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al crear préstamo");
  return data.id;
}

export async function listGastos(token: string): Promise<GastoItem[]> {
  const res = await fetchWithAuth("/api/empresa/gastos", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar gastos");
  return data.gastos ?? [];
}

/** Obtiene la base del administrador (solo role admin). */
export async function getCajaAdmin(token: string): Promise<number> {
  const res = await fetchWithAuth("/api/empresa/admin-caja", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar la base del administrador");
  return typeof data.cajaAdmin === "number" ? data.cajaAdmin : 0;
}

/** Transfiere monto de la base del admin a la base de una ruta (solo rutas propias). */
export async function invertirEnCajaRuta(
  token: string,
  params: { rutaId: string; monto: number }
): Promise<{ cajaAdmin: number; cajaRuta: number; capitalTotal: number }> {
  const res = await fetchWithAuth("/api/empresa/invertir-caja-ruta", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al invertir en la ruta");
  return {
    cajaAdmin: typeof data.cajaAdmin === "number" ? data.cajaAdmin : 0,
    cajaRuta: typeof data.cajaRuta === "number" ? data.cajaRuta : 0,
    capitalTotal: typeof data.capitalTotal === "number" ? data.capitalTotal : 0,
  };
}

export type InversionCajaRutaItem = {
  id: string;
  rutaId: string;
  rutaNombre: string;
  monto: number;
  fecha: string | null;
  invertidoPorUid: string;
  invertidoPorNombre: string;
};

export async function listInversionesCajaRuta(token: string): Promise<InversionCajaRutaItem[]> {
  const res = await fetchWithAuth("/api/empresa/inversiones-caja-ruta", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar historial de inversiones");
  return Array.isArray(data.items) ? data.items : [];
}

export type ResumenRutaItem = {
  rutaId: string;
  nombre: string;
  ubicacion: string;
  ingreso: number;
  egreso: number;
  gastos: number;
  salidas: number;
  inversion: number;
  bolsa: number;
  cajaRuta: number;
  cajasEmpleados: number;
  ganancias: number;
  perdidas: number;
  utilidad: number;
  capitalRuta: number;
  adminId: string;
};

export type ResumenEconomicoResponse = {
  rutas: ResumenRutaItem[];
  utilidadGlobal: number;
  /** Capital del administrador (solo role admin; en otros roles suele ser 0). */
  capitalAdmin: number;
};

export async function getResumenEconomico(token: string): Promise<ResumenEconomicoResponse> {
  const res = await fetchWithAuth("/api/empresa/resumen", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar resumen");
  const rutas: ResumenRutaItem[] = (data.rutas ?? []).map((r: ResumenRutaItem) => ({
    ...r,
    capitalRuta: typeof r.capitalRuta === "number" ? r.capitalRuta : 0,
    adminId: typeof r.adminId === "string" ? r.adminId : "",
  }));
  return {
    rutas,
    utilidadGlobal: typeof data.utilidadGlobal === "number" ? data.utilidadGlobal : 0,
    capitalAdmin: typeof data.capitalAdmin === "number" ? data.capitalAdmin : 0,
  };
}

export async function createGasto(
  token: string,
  params: {
    descripcion: string;
    monto: number;
    fecha?: string;
    tipo?: "transporte" | "alimentacion" | "otro";
    evidencia?: string;
    /** Solo administrador: gasto de una ruta o gasto personal/administrativo */
    alcance?: "ruta" | "admin";
    rutaId?: string;
  }
): Promise<string> {
  const res = await fetchWithAuth("/api/empresa/gastos", token, {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al registrar gasto");
  return data.id;
}

/** Habilita o deshabilita un empleado (solo el admin que lo creó). Requiere token. */
export async function setEmpleadoEnabled(
  token: string,
  empleadoUid: string,
  enabled: boolean
): Promise<void> {
  const res = await fetchWithAuth(`/api/empresa/empleados/${encodeURIComponent(empleadoUid)}/enabled`, token, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al actualizar empleado");
}

/** Marca o desmarca un cliente como moroso (excluido de ruta, no volver a prestar) */
export async function setClienteMoroso(
  token: string,
  clienteId: string,
  moroso: boolean
): Promise<void> {
  const res = await fetchWithAuth(`/api/empresa/clientes/${encodeURIComponent(clienteId)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ moroso }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al actualizar cliente");
}

// ── Cierres mensuales ───────────────────────────────────────────────────────

export type CierreRutaSnapshot = {
  rutaId: string;
  nombre: string;
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
  gastos: number;
  utilidad: number;
  capitalTotal: number;
};

export type CierreMensualItem = {
  periodo: string;
  fechaCierre: string | null;
  utilidadGlobal?: number;
  rutasCount?: number;
};

export type CierreMensualDetalle = {
  periodo: string;
  fechaCierre: string | null;
  rutas: CierreRutaSnapshot[];
  cajaEmpresa?: number;
  gastosEmpresa?: number;
  capitalEmpresa?: number;
  capitalAsignadoAdmins?: number;
  utilidadGlobal?: number;
};

export async function getCierresMensuales(token: string): Promise<CierreMensualItem[]> {
  const res = await fetchWithAuth("/api/empresa/cierres", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar cierres");
  return data.cierres ?? [];
}

export async function getCierreMensual(
  token: string,
  periodo: string
): Promise<CierreMensualDetalle> {
  const res = await fetchWithAuth(`/api/empresa/cierres?periodo=${encodeURIComponent(periodo)}`, token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar cierre");
  return data;
}

export async function crearCierreMensual(
  token: string,
  periodo?: string
): Promise<{ periodo: string; fechaCierre: string; utilidadGlobal: number; rutasCount: number }> {
  const res = await fetchWithAuth("/api/empresa/cierres", token, {
    method: "POST",
    body: JSON.stringify(periodo ? { periodo } : {}),
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al crear cierre");
  return data;
}
