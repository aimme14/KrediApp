/**
 * Cliente para el capital de empresa (solo jefe).
 * APIs: GET/PUT /api/jefe/capital con Authorization Bearer.
 */

export interface CapitalHistorialEntry {
  id?: string;
  /** Origen del movimiento (subcolección `flujo` en Firestore). */
  tipo?: string;
  montoAnterior: number;
  montoNuevo: number;
  at: string | null;
  montoTransferencia?: number;
  deltaCaja?: number;
  cajaAnterior?: number;
  cajaNueva?: number;
  adminUid?: string;
  adminNombre?: string;
}

export interface CapitalResponse {
  monto: number;
  /** Resultado: cajaEmpresa + suma(capital admin) − gastos empresa */
  capitalEmpresa: number;
  capitalTotal: number;
  cajaEmpresa: number;
  gastosEmpresa: number;
  sumaCapitalAdmins: number;
  capitalAsignadoAdmins: number;
  updatedAt: string | null;
  historial: CapitalHistorialEntry[];
}

function toCapitalResponse(json: Record<string, unknown>): CapitalResponse {
  const monto = typeof json.monto === "number" ? json.monto : 0;
  const capitalTotal =
    typeof json.capitalTotal === "number"
      ? json.capitalTotal
      : typeof json.capitalEmpresa === "number"
        ? json.capitalEmpresa
        : monto;
  const capitalEmpresa =
    typeof json.capitalEmpresa === "number" ? json.capitalEmpresa : capitalTotal;
  return {
    monto,
    capitalEmpresa,
    capitalTotal,
    cajaEmpresa:
      typeof json.cajaEmpresa === "number" ? json.cajaEmpresa : monto,
    gastosEmpresa: typeof json.gastosEmpresa === "number" ? json.gastosEmpresa : 0,
    sumaCapitalAdmins:
      typeof json.sumaCapitalAdmins === "number" ? json.sumaCapitalAdmins : 0,
    capitalAsignadoAdmins:
      typeof json.capitalAsignadoAdmins === "number"
        ? json.capitalAsignadoAdmins
        : typeof json.sumaCapitalAdmins === "number"
          ? json.sumaCapitalAdmins
          : 0,
    updatedAt: (json.updatedAt as string) ?? null,
    historial: Array.isArray(json.historial)
      ? (json.historial as Record<string, unknown>[]).map((row) => {
          const base = {
            id: typeof row.id === "string" ? row.id : undefined,
            tipo: typeof row.tipo === "string" ? row.tipo : undefined,
            montoAnterior:
              typeof row.montoAnterior === "number" ? row.montoAnterior : 0,
            montoNuevo: typeof row.montoNuevo === "number" ? row.montoNuevo : 0,
            at: typeof row.at === "string" ? row.at : null,
          };
          const out: CapitalHistorialEntry = { ...base };
          if (typeof row.montoTransferencia === "number") {
            out.montoTransferencia = row.montoTransferencia;
          }
          if (typeof row.deltaCaja === "number") out.deltaCaja = row.deltaCaja;
          if (typeof row.cajaAnterior === "number") out.cajaAnterior = row.cajaAnterior;
          if (typeof row.cajaNueva === "number") out.cajaNueva = row.cajaNueva;
          if (typeof row.adminUid === "string") out.adminUid = row.adminUid;
          if (typeof row.adminNombre === "string") out.adminNombre = row.adminNombre;
          return out;
        })
      : [],
  };
}

function extractApiErrorMessage(
  json: Record<string, unknown>,
  fallbackMessage: string
): string {
  const rawError = (json as { error?: unknown }).error;
  if (typeof rawError === "string") return rawError;
  if (!rawError) return fallbackMessage;
  if (typeof rawError === "object") {
    const maybeMessage = (rawError as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return fallbackMessage;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  // Leemos como texto para poder manejar respuestas vacías o no-JSON
  // sin romper con "Unexpected end of JSON input".
  const text = await res.text();
  if (!text) {
    throw new Error(`Respuesta vacía del servidor (HTTP ${res.status}).`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.length > 140 ? `${text.slice(0, 140)}...` : text;
    throw new Error(`Respuesta no-JSON del servidor (HTTP ${res.status}): ${snippet}`);
  }
}

export async function getCapital(token: string): Promise<CapitalResponse> {
  const res = await fetch("/api/jefe/capital", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await parseJsonResponse<Record<string, unknown>>(res);
  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(json, "Error al obtener el capital")
    );
  }
  return toCapitalResponse(json);
}

export async function setCapital(
  token: string,
  monto: number
): Promise<CapitalResponse & { ok: boolean }> {
  const res = await fetch("/api/jefe/capital", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ monto }),
  });
  const json = await parseJsonResponse<Record<string, unknown>>(res);
  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(json, "Error al actualizar el capital")
    );
  }
  return { ...toCapitalResponse(json), ok: (json as { ok?: unknown }).ok === true };
}

export async function ajustarCapital(
  token: string,
  delta: number
): Promise<CapitalResponse & { ok: boolean }> {
  const res = await fetch("/api/jefe/capital", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ajuste: delta }),
  });
  const json = await parseJsonResponse<Record<string, unknown>>(res);
  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(json, "Error al ajustar el capital")
    );
  }
  return { ...toCapitalResponse(json), ok: (json as { ok?: unknown }).ok === true };
}

export async function registrarSalidaCapital(
  token: string,
  monto: number
): Promise<CapitalResponse & { ok: boolean }> {
  const res = await fetch("/api/jefe/capital", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ salida: monto }),
  });
  const json = await parseJsonResponse<Record<string, unknown>>(res);
  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(json, "Error al registrar salida")
    );
  }
  return { ...toCapitalResponse(json), ok: (json as { ok?: unknown }).ok === true };
}

/** Entrada de liquidez a la base empresa (no transfiere a administradores). */
export type InvertirEmpresaBody = {
  monto: number;
};

export async function invertirCajaJefe(
  token: string,
  body: InvertirEmpresaBody
): Promise<CapitalResponse & { ok: boolean }> {
  const res = await fetch("/api/jefe/invertir", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ monto: body.monto }),
  });
  const json = await parseJsonResponse<Record<string, unknown>>(res);
  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(json, "Error al invertir")
    );
  }
  return { ...toCapitalResponse(json), ok: (json as { ok?: unknown }).ok === true };
}

/** Inversión a caja de administrador: base empresa → cajaAdmin (capital total sin cambio neto). */
export type TransferirBaseAdminBody = {
  adminUid: string;
  monto: number;
};

export async function transferirBaseEmpresaAAdmin(
  token: string,
  body: TransferirBaseAdminBody
): Promise<CapitalResponse & { ok: boolean }> {
  const res = await fetch("/api/jefe/transferir-base-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ adminUid: body.adminUid, monto: body.monto }),
  });
  const json = await parseJsonResponse<Record<string, unknown>>(res);
  if (!res.ok) {
    throw new Error(
      extractApiErrorMessage(json, "Error al invertir en caja de administrador")
    );
  }
  return { ...toCapitalResponse(json), ok: (json as { ok?: unknown }).ok === true };
}

