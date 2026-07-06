"use client";

import { useEffect, useId, useState } from "react";
import {
  FREE_TRIAL_END_DATE,
  debeMostrarTrialReminder,
  diasRestantesTrial,
  registrarCierreTrialReminder,
} from "@/lib/trial-reminder";

const MENSAJES_MOTIVADORES = [
  "Cada cobro bien registrado hoy es un ladrillo más para tu negocio.",
  "La constancia en la ruta es lo que separa un buen mes de uno excelente.",
  "Organizar tu cobranza hoy te ahorra dolores de cabeza mañana.",
  "Tu equipo y tus clientes notan cuando llevas el control al día.",
  "Un préstamo bien seguido es confianza ganada en la calle.",
] as const;

function mensajeDelDia(): string {
  const idx = new Date().getDate() % MENSAJES_MOTIVADORES.length;
  return MENSAJES_MOTIVADORES[idx];
}

function formatearFechaFin(): string {
  const [y, m, d] = FREE_TRIAL_END_DATE.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  return fecha.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function TrialReminderCard() {
  const [visible, setVisible] = useState(false);
  const bodyId = useId();

  useEffect(() => {
    setVisible(debeMostrarTrialReminder());
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [visible]);

  const cerrar = () => {
    registrarCierreTrialReminder();
    setVisible(false);
  };

  if (!visible) return null;

  const dias = diasRestantesTrial();
  const etiquetaDias =
    dias === 1 ? "Queda 1 día" : `Quedan ${dias} días`;

  return (
    <div
      className="trial-reminder-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-reminder-titulo"
      aria-describedby={bodyId}
    >
      <div className="trial-reminder-backdrop" onClick={cerrar} aria-hidden />
      <div className="trial-reminder-card" onClick={(e) => e.stopPropagation()}>
        <div className="trial-reminder-badge" aria-hidden>
          ✦
        </div>
        <p className="trial-reminder-eyebrow">Acceso gratuito</p>
        <h2 className="trial-reminder-titulo" id="trial-reminder-titulo">
          Sigue creciendo con angry birds
        </h2>
        <div className="trial-reminder-body" id={bodyId}>
          <p className="trial-reminder-mensaje">{mensajeDelDia()}</p>
          <p className="trial-reminder-countdown">
            <strong>{etiquetaDias}</strong> de versión gratuita
          </p>
          <p className="trial-reminder-fecha">
            El acceso sin costo termina el <strong>{formatearFechaFin()}</strong>.
            Después podrás continuar con el plan mensual de la app.
          </p>
        </div>
        <button type="button" className="btn btn-primary trial-reminder-btn" onClick={cerrar}>
          ¡Vamos!
        </button>
        <p className="trial-reminder-nota">Solo informativo · no afecta tu uso actual</p>
      </div>
    </div>
  );
}
