"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  getCajaAdmin,
  getResumenEconomico,
  listRutas,
  listClientes,
  listPrestamos,
  listGastos,
} from "@/lib/empresa-api";
import { listUsersByCreator } from "@/lib/users";

function formatMoneda(value: number): string {
  const hasDecimals = Math.round(value * 100) % 100 !== 0;
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

const QUICK_LINKS = [
  { href: "/dashboard/admin/ruta-del-dia", label: "Ruta del día", icon: "ruta-dia" },
  { href: "/dashboard/admin/rutas", label: "Rutas", icon: "route" },
  { href: "/dashboard/admin/empleado", label: "Empleados", icon: "user" },
  { href: "/dashboard/admin/cliente", label: "Clientes", icon: "client" },
  { href: "/dashboard/admin/prestamo", label: "Crear préstamo", icon: "loan" },
  { href: "/dashboard/admin/gastos", label: "Gastos operativos", icon: "expense" },
  { href: "/dashboard/admin/reportes-dia", label: "Reportes del día", icon: "report" },
  { href: "/dashboard/admin/gestion-financiera", label: "Gestión financiera", icon: "wallet" },
  { href: "/dashboard/admin/resumen", label: "Resumen económico", icon: "chart" },
  { href: "/dashboard/admin/permisos", label: "Permisos", icon: "lock" },
  { href: "/dashboard/admin/cliente-moroso", label: "Clientes morosos", icon: "alert" },
] as const;

function QuickLinkIcon({ name }: { name: string }) {
  const size = 20;
  switch (name) {
    case "ruta-dia":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    case "route":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><circle cx="16.5" cy="8.5" r="2.5" /><circle cx="7.5" cy="14.5" r="2.5" />
        </svg>
      );
    case "user":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "client":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "loan":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "expense":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "report":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      );
    case "chart":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "wallet":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
          <path d="M21 9h-6a2 2 0 0 0 0 4h6" />
          <circle cx="16" cy="11" r="1" />
        </svg>
      );
    case "lock":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "alert":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

type Stats = {
  rutas: number;
  empleados: number;
  clientes: number;
  prestamosActivos: number;
  morosos: number;
  gastosRegistrados: number;
};

export default function AdminDashboardPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    rutas: 0,
    empleados: 0,
    clientes: 0,
    prestamosActivos: 0,
    morosos: 0,
    gastosRegistrados: 0,
  });
  const [cajaAdmin, setCajaAdmin] = useState(0);
  const [capitalAdmin, setCapitalAdmin] = useState(0);

  useEffect(() => {
    if (!user || !profile || profile.role !== "admin") return;
    let cancelled = false;

    const load = async () => {
      try {
        const token = await user.getIdToken();
        const [rutas, empleados, clientes, prestamos, clientesMorosos, gastos, caja, resumen] =
          await Promise.all([
            listRutas(token),
            listUsersByCreator(profile.uid, "trabajador"),
            listClientes(token),
            listPrestamos(token),
            listClientes(token, undefined, { moroso: true }),
            listGastos(token),
            getCajaAdmin(token),
            getResumenEconomico(token),
          ]);
        if (cancelled) return;
        const activos = prestamos.filter((p) => p.estado !== "pagado");
        setStats({
          rutas: rutas.length,
          empleados: empleados.length,
          clientes: clientes.length,
          prestamosActivos: activos.length,
          morosos: clientesMorosos.length,
          gastosRegistrados: gastos.length,
        });
        setCajaAdmin(caja);
        setCapitalAdmin(resumen.capitalAdmin ?? 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar datos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user, profile]);

  if (!profile || profile.role !== "admin") return null;

  if (loading) {
    return (
      <div className="card">
        <p style={{ color: "var(--text-muted)" }}>Cargando panel...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Inicio</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Resumen rápido de tu gestión. Usa el menú o los enlaces para ir a cada sección.
        </p>
        {error && <p className="error-msg">{error}</p>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
          role="list"
        >
          <div className="card" style={{ padding: "1rem", margin: 0 }} role="listitem">
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Rutas</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>{stats.rutas}</span>
          </div>
          <div className="card" style={{ padding: "1rem", margin: 0 }} role="listitem">
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Empleados</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>{stats.empleados}</span>
          </div>
          <div className="card" style={{ padding: "1rem", margin: 0 }} role="listitem">
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Clientes</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>{stats.clientes}</span>
          </div>
          <div className="card" style={{ padding: "1rem", margin: 0 }} role="listitem">
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Préstamos activos</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>{stats.prestamosActivos}</span>
          </div>
          <div className="card" style={{ padding: "1rem", margin: 0 }} role="listitem">
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Morosos</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: stats.morosos > 0 ? "#dc2626" : "var(--text)" }}>{stats.morosos}</span>
          </div>
          <div className="card" style={{ padding: "1rem", margin: 0 }} role="listitem">
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Gastos registrados</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" }}>{stats.gastosRegistrados}</span>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            borderColor: "var(--card-border)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: "0.35rem",
              }}
            >
              Base
            </span>
            <span style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text)" }} aria-live="polite">
              {formatMoneda(cajaAdmin)}
            </span>
          </div>
          <div>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                display: "block",
                marginBottom: "0.35rem",
              }}
            >
              Capital
            </span>
            <span style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text)" }} aria-live="polite">
              {formatMoneda(capitalAdmin)}
            </span>
          </div>
          <div style={{ alignSelf: "center", justifySelf: "end", gridColumn: "1 / -1" }}>
            <Link
              href="/dashboard/admin/gestion-financiera"
              style={{
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Ver gestión financiera
            </Link>
          </div>
        </div>

        <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Accesos rápidos</h3>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.5rem",
          }}
        >
          {QUICK_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "10px",
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  color: "var(--text)",
                  textDecoration: "none",
                  fontWeight: 500,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                className="admin-quick-link"
              >
                <span style={{ display: "flex", color: "#dc2626" }}>
                  <QuickLinkIcon name={item.icon} />
                </span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
