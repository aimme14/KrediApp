"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { TrabajadorRutaProvider, useTrabajadorRuta } from "@/context/TrabajadorRutaContext";
import { TrabajadorListaProvider } from "@/context/TrabajadorListaContext";

const NAV_ITEMS = [
  { href: "/dashboard/trabajador", label: "Inicio", icon: "home" },
  { href: "/dashboard/trabajador/ruta", label: "Ruta del día", icon: "route" },
  { href: "/dashboard/trabajador/caja-del-dia", label: "Caja del día", icon: "wallet" },
  { href: "/dashboard/trabajador/resumen", label: "Entrega de reporte", icon: "chart" },
  { href: "/dashboard/trabajador/cliente", label: "Cliente", icon: "client" },
  { href: "/dashboard/trabajador/prestamo", label: "Prestamos", icon: "loan" },
  { href: "/dashboard/trabajador/simulacro", label: "Simulador de Crédito", icon: "calc" },
  { href: "/dashboard/trabajador/gastos", label: "Gastos operativos", icon: "expense" },
  { href: "/dashboard/trabajador/registrar-gasto", label: "Registrar gasto", icon: "expense" },
  { href: "/dashboard/trabajador/cliente-moroso", label: "Cliente moroso", icon: "alert" },
] as const;

const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard/trabajador", label: "Inicio", icon: "home" },
  { href: "/dashboard/trabajador/ruta", label: "Ruta", icon: "route" },
  { href: "/dashboard/trabajador/resumen", label: "Entrega", icon: "chart" },
  { type: "menu" as const, label: "Más", icon: "menu" },
];

function NavIcon({ name }: { name: string }) {
  const size = 22;
  switch (name) {
    case "home":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
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
    case "wallet":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
          <path d="M21 9h-6a2 2 0 0 0 0 4h6" />
          <circle cx="16" cy="11" r="1" />
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
    case "menu":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      );
    default:
      return null;
  }
}

/** Bloquea la operación si el admin cerró la ruta (`rutaOperativa === false`). Una sola suscripción en el provider. */
function RutaOperativaGate({ children }: { children: React.ReactNode }) {
  const { puedeOperar, loading } = useTrabajadorRuta();

  if (loading || puedeOperar) {
    return <>{children}</>;
  }

  return (
    <div className="container" style={{ paddingTop: "2rem", maxWidth: "420px" }}>
      <div className="card ruta-operativa-cerrada-card">
        <h2 className="ruta-operativa-cerrada-title">Ruta no disponible.</h2>
        <p className="ruta-operativa-cerrada-hint">
          Si necesitas trabajar ya, contacta al administrador para que habilite la operación del día.
        </p>
      </div>
    </div>
  );
}

/** Rutas que conviene precargar para que el cambio de pestaña sea más rápido. */
const PREFETCH_TRABAJADOR_HREFS = [
  "/dashboard/trabajador",
  "/dashboard/trabajador/ruta",
  "/dashboard/trabajador/caja-del-dia",
  "/dashboard/trabajador/resumen",
  "/dashboard/trabajador/cliente",
  "/dashboard/trabajador/prestamo",
] as const;

export default function TrabajadorLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    for (const href of PREFETCH_TRABAJADOR_HREFS) {
      router.prefetch(href);
    }
  }, [router]);

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.push("/");
      return;
    }
    if (profile.role !== "trabajador") {
      router.push("/dashboard");
      return;
    }
    if (!isEnabled()) router.push("/deshabilitado");
  }, [user, profile, loading, isEnabled, router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading || !profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (profile.role !== "trabajador") {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Redirigiendo al panel…</p>
      </div>
    );
  }

  return (
    <TrabajadorRutaProvider>
    <TrabajadorListaProvider>
    <div className="jefe-wrapper">
      <aside className={`jefe-drawer ${menuOpen ? "jefe-drawer-open" : ""}`} aria-hidden={!menuOpen}>
        <div className="jefe-drawer-inner">
          <nav className="jefe-drawer-nav">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={`jefe-drawer-link ${pathname === item.href ? "jefe-drawer-link-active" : ""}`}>
                <span className="jefe-drawer-icon"><NavIcon name={item.icon} /></span>
                <span className="jefe-drawer-label">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      {menuOpen && <button type="button" className="jefe-drawer-backdrop" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
      <main className="jefe-main">
        <RutaOperativaGate>{children}</RutaOperativaGate>
      </main>
      <nav className="trabajador-bottom-nav" aria-label="Navegación principal">
        {BOTTOM_NAV_ITEMS.map((item) =>
          item.type === "menu" ? (
            <button
              key="menu"
              type="button"
              className={`trabajador-bottom-nav-item ${menuOpen ? "active" : ""}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              <span className="trabajador-bottom-nav-icon"><NavIcon name="menu" /></span>
              <span className="trabajador-bottom-nav-label">{item.label}</span>
            </button>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`trabajador-bottom-nav-item ${pathname === item.href ? "active" : ""}`}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <span className="trabajador-bottom-nav-icon"><NavIcon name={item.icon} /></span>
              <span className="trabajador-bottom-nav-label">{item.label}</span>
            </Link>
          )
        )}
      </nav>
    </div>
    </TrabajadorListaProvider>
    </TrabajadorRutaProvider>
  );
}
