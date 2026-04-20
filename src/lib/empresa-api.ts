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
  /** Efectivo asignado a empleados en jornada. */
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
  /** empresa | admin | ruta (según subcolección / legacy) */
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

/** Rutas del administrador con bases para la vista «ruta del día». */
export type RutaDelDiaEmpleadoItem = {
  uid: string;
  nombre: string;
  baseTrabajador: number;
  jornadaActivaEnRuta: boolean;
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

/** Pasa efectivo de la base de la ruta a la base del trabajador (misma lógica que entrega en jornada). */
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

/** Trabajador: pasa todo el efectivo de su base/jornada a la base de la ruta. */
export async function entregarReporteDia(
  token: string,
  options?: { comentario?: string }
): Promise<{ monto: number; rutaId: string }> {
  const body: Record<string, string> = {};
  if (options?.comentario !== undefined) {
    body.comentario = options.comentario;
  }
  const res = await fetchWithAuth("/api/empresa/empleado/entregar-reporte", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al entregar reporte");
  return { monto: data.monto ?? 0, rutaId: data.rutaId ?? "" };
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
};

export async function getReportesDia(
  token: string,
  fecha?: string
): Promise<{ fechaDia: string; items: ReporteDiaItem[]; totalMonto: number }> {
  const url = fecha
    ? `/api/empresa/reportes-dia?fecha=${encodeURIComponent(fecha)}`
    : "/api/empresa/reportes-dia";
  const res = await fetchWithAuth(url, token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al cargar reportes");
  return {
    fechaDia: data.fechaDia ?? "",
    items: Array.isArray(data.items) ? data.items : [],
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
