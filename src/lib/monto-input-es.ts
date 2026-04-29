/**
 * Entrada de montos COP (es-CO): miles con punto, decimales con coma donde aplique.
 * No usar en campos de porcentaje o conteos (cuotas, etc.).
 */

function normalizeIntDigits(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d === "") return "";
  const noLead = d.replace(/^0+/, "");
  return noLead === "" ? "0" : noLead;
}

function formatThousandsDots(digits: string): string {
  if (digits === "") return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Solo enteros: formateo con puntos mientras se escribe. */
export function formatMontoEnteroInput(display: string): string {
  const digits = normalizeIntDigits(display);
  return formatThousandsDots(digits);
}

/** Interpreta texto con puntos de miles (y opcional coma decimal). */
export function parseMontoEnteroFormatted(val: string): number {
  const raw = val.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Interior para montos con decimales: dígitos [,frac{0-2}] o dígitos + "," al escribir.
 */
export function sanitizeMontoDecimalCOP(display: string): string {
  const raw = display.replace(/\./g, "").replace(/\s/g, "").replace(/[^\d,]/g, "");
  const comma = raw.indexOf(",");

  if (comma === -1) {
    const d = raw.replace(/\D/g, "");
    return d.length ? normalizeIntDigits(d) : "";
  }

  let left = raw.slice(0, comma).replace(/\D/g, "");
  const frac = raw.slice(comma + 1).replace(/\D/g, "").slice(0, 2);
  const afterComma = raw.slice(comma + 1);

  if (!left.length && frac.length) left = "0";
  else if (left.length) left = normalizeIntDigits(left);
  /* Solo "," con nada válido antes/después → vacío */
  if (!left.length && !frac.length) return "";

  /* Tras coma hay solo espacio vacío o usuario acaba en "," */
  if (!frac.length && (afterComma.length === 0 || afterComma.trim() === "")) {
    return `${left},`;
  }

  return `${left},${frac}`;
}

export function formatMontoDecimalCOPDisplay(interior: string): string {
  if (!interior) return "";

  const hasComma = interior.includes(",");
  if (!hasComma) {
    const d = interior.replace(/\D/g, "");
    return d.length ? formatThousandsDots(d) : "";
  }

  const parts = interior.split(",", 2);
  const whole = (parts[0] ?? "").replace(/\D/g, "");
  let fracPart = parts[1] ?? "";

  if (interior.endsWith(",") && fracPart === "") {
    const wFmt = whole.length ? formatThousandsDots(normalizeIntDigits(whole)) : "";
    return wFmt !== "" ? `${wFmt},` : ",";
  }

  const wFmt = formatThousandsDots(normalizeIntDigits(whole));
  fracPart = fracPart.replace(/\D/g, "").slice(0, 2);
  return fracPart.length ? `${wFmt},${fracPart}` : wFmt;
}

/** Paso a número desde interior decimal COP (sin puntos miles). */
export function interiorDecimalCOPToNumber(interior: string): number {
  if (!interior.trim()) return NaN;
  const t = interior.endsWith(",") ? interior.slice(0, -1) : interior;
  if (t.trim() === "") return NaN;
  return Number(t.replace(",", "."));
}
