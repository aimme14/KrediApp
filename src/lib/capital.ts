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
  updatedAt: string | null;
  historial: CapitalHistorialEntry[];
}

export async function getCapital(token: string): Promise<CapitalResponse> {
  const res = await fetch("/api/jefe/capital", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Error al obtener el capital");
  return {
    monto: typeof json.monto === "number" ? json.monto : 0,
    updatedAt: json.updatedAt ?? null,
    historial: Array.isArray(json.historial) ? json.historial : [],
  };
}

export async function setCapital(
  token: string,
  monto: number
): Promise<{ monto: number; updatedAt: string; historial: CapitalHistorialEntry[] }> {
  const res = await fetch("/api/jefe/capital", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ monto }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Error al actualizar el capital");
  return {
    monto: json.monto,
    updatedAt: json.updatedAt,
    historial: Array.isArray(json.historial) ? json.historial : [],
  };
}

export async function clearCapitalHistorial(token: string): Promise<void> {
  const res = await fetch("/api/jefe/capital", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clearHistorial: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Error al limpiar historial");
}
