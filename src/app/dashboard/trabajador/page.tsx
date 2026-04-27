"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const QUICK_ACTIONS = [
  { href: "/dashboard/trabajador/ruta", label: "Ruta del día", icon: "route", desc: "Ver y gestionar tu ruta" },
  { href: "/dashboard/trabajador/resumen", label: "Entrega de reporte", icon: "chart", desc: "Solicitud de entrega al administrador" },
  { href: "/dashboard/trabajador/cliente", label: "Cliente", icon: "client", desc: "Gestión de clientes" },
  { href: "/dashboard/trabajador/prestamo", label: "Préstamos", icon: "loan", desc: "Registrar y ver préstamos" },
  { href: "/dashboard/trabajador/simulacro", label: "Simulador de Crédito", icon: "calc", desc: "Calcular cuotas" },
  { href: "/dashboard/trabajador/gastos", label: "Gastos operativos", icon: "expense", desc: "Registrar gastos" },
  { href: "/dashboard/trabajador/cliente-moroso", label: "Cliente moroso", icon: "alert", desc: "Alertas de morosidad" },
] as const;

function QuickIcon({ name }: { name: string }) {
  const size = 28;
  switch (name) {
    case "route":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" />
          <circle cx="16.5" cy="8.5" r="2.5" /><circle cx="7.5" cy="14.5" r="2.5" />
        </svg>
      );
    case "chart":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "client":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "loan":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "calc":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="12" y2="14" />
        </svg>
      );
    case "expense":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "alert":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TrabajadorInicioPage() {
  const { profile } = useAuth();
  const displayName = profile?.displayName?.trim() || "empleado";

  return (
    <div className="trabajador-inicio">
      <header className="trabajador-inicio-header">
        <h1 className="trabajador-inicio-title">
          Hola, {displayName}
        </h1>
        <p className="trabajador-inicio-subtitle">
          Acceso rápido a tus funciones
        </p>
      </header>

      <nav className="trabajador-inicio-grid" aria-label="Accesos rápidos">
        {QUICK_ACTIONS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="trabajador-inicio-card"
            aria-label={`${item.label}: ${item.desc}`}
          >
            <span className="trabajador-inicio-card-icon">
              <QuickIcon name={item.icon} />
            </span>
            <span className="trabajador-inicio-card-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
