"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCapitalJefe } from "@/hooks/useCapitalJefe";
import { PanelCapital } from "./PanelCapital";
import { PanelCaja } from "./PanelCaja";
import type { CapitalHistorialEntry } from "@/lib/capital";

type Tendencia = "subiendo" | "bajando" | "estable";

function getTendencia(historial: CapitalHistorialEntry[]): Tendencia {
  if (historial.length < 2) return "estable";
  const a = historial[0].montoNuevo;
  const b = historial[1].montoNuevo;
  if (a > b) return "subiendo";
  if (a < b) return "bajando";
  return "estable";
}

function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function JefeGestionFinancieraPanel({
  showPageHeader = true,
}: {
  /** En inicio del jefe el encabezado FINANZAS/fecha lo reemplaza una franja con logo; ocultar aquí. */
  showPageHeader?: boolean;
} = {}) {
  const { profile } = useAuth();
  const { monto, cajaEmpresa, sumaCapitalAdmins, historial, loading, error, setCapital } =
    useCapitalJefe();
  const [seccionActiva, setSeccionActiva] = useState<"capital" | "caja">("capital");

  const tendencia = getTendencia(historial);
  const fechaHoyRaw = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const fechaHoy = fechaHoyRaw.charAt(0).toUpperCase() + fechaHoyRaw.slice(1);

  if (!profile || profile.role !== "jefe") return null;

  return (
    <div className={`gestion-financiera-page${showPageHeader ? "" : " gestion-financiera-page--embedded"}`}>
      {showPageHeader ? (
        <header className="gf-header">
          <div className="gf-header-bg" aria-hidden />
          <div className="gf-header-content gf-header-content--minimal">
            <p className="gf-eyebrow">FINANZAS</p>
            <time className="gf-date" dateTime={new Date().toISOString()}>
              {fechaHoy}
            </time>
          </div>
        </header>
      ) : null}

      <div className="gf-kpi-grid">
        <div className="gf-kpi-card gf-kpi-capital">
          <span className="gf-kpi-emoji" aria-hidden>
            💰
          </span>
          <span className="gf-kpi-value">{formatMonto(monto)}</span>
          <span className="gf-kpi-label">CAPITAL</span>
          <span className="gf-kpi-sub" />
          {historial.length > 0 && (
            <span
              className={`gf-kpi-badge ${tendencia === "subiendo" ? "gf-kpi-up" : tendencia === "bajando" ? "gf-kpi-down" : "gf-kpi-neutral"}`}
            >
              {tendencia === "subiendo" ? "↑" : tendencia === "bajando" ? "↓" : "→"}{" "}
              {tendencia === "estable" ? "Estable" : ""}
            </span>
          )}
        </div>
        <div className="gf-kpi-card gf-kpi-caja">
          <span className="gf-kpi-emoji" aria-hidden>
            🏦
          </span>
          <span className="gf-kpi-value">{formatMonto(cajaEmpresa)}</span>
          <span className="gf-kpi-label">CAJA DE LA EMPRESA</span>
          <span className="gf-kpi-sub" />
        </div>
      </div>

      <nav className="gf-tabs" role="tablist" aria-label="Secciones de gestión financiera: capital y caja de la empresa">
        <button
          type="button"
          role="tab"
          aria-selected={seccionActiva === "capital"}
          aria-controls="gf-panel-capital"
          id="gf-tab-capital"
          className={`gf-tab ${seccionActiva === "capital" ? "gf-tab-active" : ""}`}
          onClick={() => setSeccionActiva("capital")}
        >
          <span className="gf-tab-icon" aria-hidden>
            💰
          </span>
          Capital
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={seccionActiva === "caja"}
          aria-controls="gf-panel-caja"
          id="gf-tab-caja"
          className={`gf-tab ${seccionActiva === "caja" ? "gf-tab-active" : ""}`}
          onClick={() => setSeccionActiva("caja")}
        >
          <span className="gf-tab-icon" aria-hidden>
            🏦
          </span>
          Caja
        </button>
      </nav>

      <div
        id="gf-panel-capital"
        role="tabpanel"
        aria-labelledby="gf-tab-capital"
        hidden={seccionActiva !== "capital"}
        className="gf-panel"
      >
        <PanelCapital monto={monto} loading={loading} error={error} historial={historial} />
      </div>

      <div
        id="gf-panel-caja"
        role="tabpanel"
        aria-labelledby="gf-tab-caja"
        hidden={seccionActiva !== "caja"}
        className="gf-panel"
      >
        <PanelCaja
          cajaEmpresa={cajaEmpresa}
          sumaCapitalAdmins={sumaCapitalAdmins}
          loading={loading}
          error={error}
          historial={historial}
          adminsEnabled={seccionActiva === "caja"}
          onCapitalUpdate={(data) =>
            setCapital((prev) => (prev ? { ...prev, ...data } : null))
          }
        />
      </div>
    </div>
  );
}
