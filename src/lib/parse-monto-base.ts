/**
 * Interpreta el campo "base" cuando el usuario ingresa un monto (asignación de capital).
 * Si no es un número positivo (p. ej. texto "Norte"), devuelve null.
 */
export function parseMontoBase(raw: string | undefined): number | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return null;

  let normalized = t;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");

  if (hasComma && hasDot) {
    normalized =
      t.lastIndexOf(",") > t.lastIndexOf(".")
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
  } else if (hasComma && !hasDot) {
    const parts = t.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = parts[0].replace(/\./g, "") + "." + parts[1];
    } else {
      normalized = t.replace(/\./g, "").replace(/,/g, "");
    }
  } else {
    normalized = t.replace(/,/g, "");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
