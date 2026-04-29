/**
 * Nombre de topic FCM para gastos del equipo por admin.
 * Debe coincidir entre subscribeToTopic (al registrar token) y send (al crear gasto).
 * Caracteres permitidos por FCM: [a-zA-Z0-9-_.~%]+
 */

export function topicGastosAdmin(empresaId: string, adminUid: string): string {
  const safe = (s: string) =>
    String(s ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9-_.~%]/g, "_");
  const e = safe(empresaId) || "e";
  const a = safe(adminUid) || "a";
  const topic = `kredi-gasto_${e}_${a}`;
  return topic.length > 850 ? topic.slice(0, 850) : topic;
}
