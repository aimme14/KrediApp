/** Muestra cuotas restantes sobre total, p. ej. `3/12`. */
export function formatoCuotasRestanteTotal(restantes: number, totalCuotas: number): string {
  if (!Number.isFinite(totalCuotas) || totalCuotas <= 0) return "—";
  const r = Math.max(0, Math.floor(restantes));
  const t = Math.floor(totalCuotas);
  return `${r}/${t}`;
}
