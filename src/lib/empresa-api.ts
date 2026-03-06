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
};

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
};

export type GastoItem = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: string | null;
  tipo: string;
  creadoPor: string;
  rol: string;
  rutaId: string;
  adminId: string;
  empleadoId: string;
  evidencia: string;
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

/** Registra un pago (cobro) en un préstamo. */
export async function registrarPago(
  token: string,
  prestamoId: string,
  params: { monto: number; metodoPago: "efectivo" | "transferencia"; evidencia?: string }
): Promise<{ saldoPendiente: number }> {
  const res = await fetchWithAuth(`/api/empresa/prestamos/${encodeURIComponent(prestamoId)}/pagos`, token, {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al registrar pago");
  return { saldoPendiente: data.saldoPendiente ?? 0 };
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
