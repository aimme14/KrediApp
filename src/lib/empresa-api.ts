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
};

/** Item de la subcolección pagos de un préstamo (historial de cobros / no pago). */
export type PagoItem = {
  id: string;
  monto: number;
  fecha: string | null;
  tipo: "pago" | "no_pago";
  metodoPago: string | null;
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

export async function listRutas(token: string): Promise<RutaItem[]> {
  const res = await fetchWithAuth("/api/empresa/rutas", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar rutas");
  return data.rutas ?? [];
}

export async function createRuta(
  token: string,
  params: { nombre: string; ubicacion?: string }
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
};

export async function getResumenEconomico(token: string): Promise<ResumenRutaItem[]> {
  const res = await fetchWithAuth("/api/empresa/resumen", token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar resumen");
  return data.rutas ?? [];
}

export async function createGasto(
  token: string,
  params: {
    descripcion: string;
    monto: number;
    fecha?: string;
    tipo?: "transporte" | "alimentacion" | "otro";
    evidencia?: string;
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
