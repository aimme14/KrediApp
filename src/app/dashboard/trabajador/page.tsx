"use client";

import Link from "next/link";

import { TrabajadorActionIcon } from "@/components/trabajador/TrabajadorActionIcon";
import { TrabajadorInicioCajaDelDia } from "@/components/trabajador/TrabajadorInicioCajaDelDia";
import { useAuth } from "@/context/AuthContext";

const QUICK_ACTIONS = [
  { href: "/dashboard/trabajador/ruta", label: "Ruta del día", icon: "route", desc: "Ver y gestionar tu ruta" },
  { href: "/dashboard/trabajador/caja-del-dia", label: "Caja del día", icon: "wallet", desc: "Ver cobros, gastos y resumen del día" },
  { href: "/dashboard/trabajador/resumen", label: "Entrega de reporte", icon: "chart", desc: "Solicitud de entrega al administrador" },
  { href: "/dashboard/trabajador/cliente", label: "Cliente", icon: "client", desc: "Gestión de clientes" },
  { href: "/dashboard/trabajador/prestamo", label: "Préstamos", icon: "loan", desc: "Registrar y ver préstamos" },
  { href: "/dashboard/trabajador/simulacro", label: "Simulador de Crédito", icon: "calc", desc: "Calcular cuotas" },
  { href: "/dashboard/trabajador/gastos", label: "Gastos operativos", icon: "expense", desc: "Registrar gastos" },
  { href: "/dashboard/trabajador/cliente-moroso", label: "Cliente moroso", icon: "alert", desc: "Alertas de morosidad" },
] as const;

export default function TrabajadorInicioPage() {
  const { profile } = useAuth();

  const displayName = profile?.displayName?.trim() || "empleado";

  return (
    <div className="trabajador-inicio">
      <header className="trabajador-inicio-header">
        <h1 className="trabajador-inicio-title">Hola, {displayName}</h1>
      </header>

      <TrabajadorInicioCajaDelDia />

      <p className="trabajador-inicio-subtitle">Acceso rápido a tus funciones</p>

      <nav className="trabajador-inicio-grid" aria-label="Accesos rápidos">
        {QUICK_ACTIONS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="trabajador-inicio-card"
            aria-label={`${item.label}: ${item.desc}`}
          >
            <span className="trabajador-inicio-card-icon" data-quick={item.icon}>
              <TrabajadorActionIcon name={item.icon} size={28} />
            </span>
            <span className="trabajador-inicio-card-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
