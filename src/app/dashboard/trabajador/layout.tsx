"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { TrabajadorRutaProvider, useTrabajadorRuta } from "@/context/TrabajadorRutaContext";
import { TrabajadorListaProvider } from "@/context/TrabajadorListaContext";
import { TrabajadorCajaDiaProvider } from "@/context/TrabajadorCajaDiaContext";
import { TrabajadorActionIcon } from "@/components/trabajador/TrabajadorActionIcon";

const NAV_ITEMS = [
  { href: "/dashboard/trabajador", label: "Inicio", icon: "home" as const },
  { href: "/dashboard/trabajador/ruta", label: "Ruta del día", icon: "route" as const },
  { href: "/dashboard/trabajador/caja-del-dia", label: "Caja del día", icon: "wallet" as const },
  { href: "/dashboard/trabajador/resumen", label: "Entrega de reporte", icon: "chart" as const },
  { href: "/dashboard/trabajador/cliente", label: "Cliente", icon: "client" as const },
  { href: "/dashboard/trabajador/prestamo", label: "Prestamos", icon: "loan" as const },
  { href: "/dashboard/trabajador/simulacro", label: "Simulador de Crédito", icon: "calc" as const },
  { href: "/dashboard/trabajador/gastos", label: "Gastos operativos", icon: "expense" as const },
  { href: "/dashboard/trabajador/cliente-moroso", label: "Cliente moroso", icon: "alert" as const },
];

const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard/trabajador", label: "Inicio", icon: "home" as const },
  { href: "/dashboard/trabajador/ruta", label: "Ruta", icon: "route" as const },
  { href: "/dashboard/trabajador/caja-del-dia", label: "Caja del día", icon: "wallet" as const },
  { type: "menu" as const, label: "Más", icon: "menu" as const },
];

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
  /** La barra se monta en `document.body` para que `position:fixed` no quede “al final del documento” en algunas vistas (p. ej. gastos). */
  const [bottomNavHostReady, setBottomNavHostReady] = useState(false);

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

  useEffect(() => {
    setBottomNavHostReady(true);
  }, []);

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

  const bottomNav = (
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
            <span className="trabajador-bottom-nav-icon" data-nav="menu">
              <TrabajadorActionIcon name="menu" />
            </span>
            <span className="trabajador-bottom-nav-label">{item.label}</span>
          </button>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`trabajador-bottom-nav-item ${pathname === item.href ? "active" : ""}`}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <span className="trabajador-bottom-nav-icon" data-nav={item.icon}>
              <TrabajadorActionIcon name={item.icon} />
            </span>
            <span className="trabajador-bottom-nav-label">{item.label}</span>
          </Link>
        )
      )}
    </nav>
  );

  return (
    <TrabajadorRutaProvider>
      <TrabajadorListaProvider>
        <TrabajadorCajaDiaProvider>
        <div className="jefe-wrapper trabajador-dashboard trabajador-dashboard-has-bottom-nav">
          <aside className={`jefe-drawer ${menuOpen ? "jefe-drawer-open" : ""}`} aria-hidden={!menuOpen}>
            <div className="jefe-drawer-inner">
              <nav className="jefe-drawer-nav">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-nav={item.icon}
                    className={`jefe-drawer-link ${pathname === item.href ? "jefe-drawer-link-active" : ""}`}
                  >
                    <span className="jefe-drawer-icon" data-nav={item.icon}>
                      <TrabajadorActionIcon name={item.icon} size={18} />
                    </span>
                    <span className="jefe-drawer-label">{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </aside>
          {menuOpen && (
            <button type="button" className="jefe-drawer-backdrop" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />
          )}
          <main className="jefe-main">
            <RutaOperativaGate>{children}</RutaOperativaGate>
          </main>
          {bottomNavHostReady ? createPortal(bottomNav, document.body) : bottomNav}
        </div>
        </TrabajadorCajaDiaProvider>
      </TrabajadorListaProvider>
    </TrabajadorRutaProvider>
  );
}
