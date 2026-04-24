"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useDashboardHeaderSlot } from "@/context/DashboardHeaderContext";

const NAV_ITEMS = [
  { href: "/dashboard/jefe/inicio", label: "Inicio", icon: "home" },
  { href: "/dashboard/jefe/empresa", label: "Perfil de la empresa", icon: "building" },
  { href: "/dashboard/jefe/administradores", label: "Administradores", icon: "users" },
  { href: "/dashboard/jefe/gastos", label: "Gastos operativos", icon: "expense" },
  { href: "/dashboard/jefe/gestion-financiera", label: "Gestión financiera", icon: "wallet" },
  { href: "/dashboard/jefe/permisos", label: "Permisos", icon: "lock" },
] as const;

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
    case "building":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
        </svg>
      );
    case "users":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "lock":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "wallet":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      );
    case "expense":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    default:
      return null;
  }
}

export default function JefeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, isEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.push("/");
      return;
    }
    if (profile.role !== "jefe") {
      router.push("/dashboard");
      return;
    }
    if (!isEnabled()) {
      router.push("/deshabilitado");
    }
  }, [user, profile, loading, isEnabled, router]);

  const setHeaderLeftSlot = useDashboardHeaderSlot();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!setHeaderLeftSlot) return;
    setHeaderLeftSlot(
      <button
        type="button"
        className="jefe-hamburger jefe-hamburger-in-header"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
      >
        <span className="jefe-hamburger-line" />
        <span className="jefe-hamburger-line" />
        <span className="jefe-hamburger-line" />
      </button>
    );
    return () => setHeaderLeftSlot(null);
  }, [setHeaderLeftSlot, menuOpen]);

  if (loading || !profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (profile.role !== "jefe") {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Redirigiendo al panel…</p>
      </div>
    );
  }

  return (
    <div className="jefe-wrapper">
      <aside
        className={`jefe-drawer ${menuOpen ? "jefe-drawer-open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="jefe-drawer-inner">
          <nav className="jefe-drawer-nav">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href === "/dashboard/jefe/inicio" && pathname === "/dashboard/jefe");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`jefe-drawer-link ${isActive ? "jefe-drawer-link-active" : ""}`}
                >
                  <span className="jefe-drawer-icon">
                    <NavIcon name={item.icon} />
                  </span>
                  <span className="jefe-drawer-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="jefe-drawer-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <main className="jefe-main">{children}</main>
    </div>
  );
}
