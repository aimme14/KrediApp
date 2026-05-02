/** Etiqueta legible del tipo de gasto guardado en Firestore (`tipo`). */
export function etiquetaMotivoGastoTipo(tipo: string | null | undefined): string {
  const t = typeof tipo === "string" ? tipo.trim() : "";
  if (t === "transporte") return "Transporte";
  if (t === "alimentacion") return "Alimentación";
  if (t === "otro") return "Otro";
  return "—";
}
