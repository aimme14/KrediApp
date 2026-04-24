/**
 * Interpreta el interés en % desde el campo (coma o punto como decimal).
 */
export function parseInteresPct(raw: string): number {
  const v = String(raw ?? "").replace(",", ".").trim();
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Texto para UI/resumen: evita basura de coma flotante (p. ej. 19.99999999997 → "20").
 */
export function formatInteresResumenPct(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 1e8) / 1e8;
  let s = r.toFixed(4);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s || "0";
}
