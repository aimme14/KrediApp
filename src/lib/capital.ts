/**
 * Cliente para el capital de empresa (solo jefe).
 * APIs: GET/PUT /api/jefe/capital con Authorization Bearer.
 */

export interface CapitalHistorialEntry {
  montoAnterior: number;
  montoNuevo: number;
  at: string | null;
}

export interface CapitalResponse {
  monto: number;
  capitalTotal: number;
  cajaEmpresa: number;
  capitalAsignadoAdmins: number;
  updatedAt: string | null;
  historial: CapitalHistorialEntry[];
}

function toCapitalResponse(json: Record<string, unknown>): CapitalResponse {
  const monto = typeof json.monto === "number" ? json.monto : 0;
  return {
    monto,
    capitalTotal: typeof json.capitalTotal === "number" ? json.capitalTotal : monto,
    cajaEmpresa: typeof json.cajaEmpresa === "number" ? json.cajaEmpresa : monto,
    capitalAsignadoAdmins: typeof json.capitalAsignadoAdmins === "number" ? json.capitalAsignadoAdmins : 0,
    updatedAt: (json.updatedAt as string) ?? null,
    historial: Array.isArray(json.historial) ? (json.historial as CapitalHistorialEntry[]) : [],
  };
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
  if (!res.ok) throw new Error((json as { error?: unknown }).error ?? "Error al obtener el capital");
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
  if (!res.ok) throw new Error((json as { error?: unknown }).error ?? "Error al actualizar el capital");
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
  if (!res.ok) throw new Error((json as { error?: unknown }).error ?? "Error al ajustar el capital");
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
  if (!res.ok) throw new Error((json as { error?: unknown }).error ?? "Error al registrar salida");
  return { ...toCapitalResponse(json), ok: (json as { ok?: unknown }).ok === true };
}

export async function clearCapitalHistorial(token: string): Promise<void> {
  const res = await fetch("/api/jefe/capital", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clearHistorial: true }),
  });
  // Se consume la respuesta para que el cliente no se quede esperando,
  // y falla con un error legible si el servidor no responde JSON.
  const json = await parseJsonResponse<Record<string, unknown>>(res);
  if (!res.ok) throw new Error((json as { error?: unknown }).error ?? "Error al limpiar historial");
}
