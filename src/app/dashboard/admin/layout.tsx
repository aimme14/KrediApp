"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useDashboardHeaderSlot } from "@/context/DashboardHeaderContext";
import { AdminFcmRegistration } from "@/components/AdminFcmRegistration";
import { TrabajadorListaProvider } from "@/context/TrabajadorListaContext";
import { listClientes } from "@/lib/empresa-api";
import { ADMIN_NAV_SECTIONS, AdminNavIcon } from "@/components/admin/adminNavConfig";

function adminNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard/admin") return pathname === "/dashboard/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, error, isEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [morososCount, setMorososCount] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.push("/");
      return;
    }
    if (profile.role !== "admin") {
      router.push("/dashboard");
      return;
    }
    if (!isEnabled()) {
      router.push("/deshabilitado");
    }
  }, [user, profile, loading, isEnabled, router]);

  useEffect(() => {
    if (!user || !profile || profile.role !== "admin") return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const morosos = await listClientes(token, undefined, { moroso: true });
        if (!cancelled) setMorososCount(morosos.length);
      } catch {
        if (!cancelled) setMorososCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  const setHeaderLeftSlot = useDashboardHeaderSlot();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!setHeaderLeftSlot) return;
    setHeaderLeftSlot(
      <button
        type="button"
        className="jefe-hamburger jefe-hamburger-in-header admin-shell-hamburger"
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

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>{error || "No se pudo cargar tu perfil. Recarga la página."}</p>
      </div>
    );
  }

  if (profile.role !== "admin") {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Redirigiendo al panel…</p>
      </div>
    );
  }

  return (
    <TrabajadorListaProvider>
      <div className="admin-shell">
        <AdminFcmRegistration />
        <aside
          className={`admin-sidebar ${menuOpen ? "admin-sidebar-open" : ""}`}
          aria-label="Navegación del administrador"
        >
          <div className="admin-sidebar-inner">
            {ADMIN_NAV_SECTIONS.map((section) => (
              <div key={section.heading} className="admin-nav-section">
                <span className="admin-nav-heading">{section.heading}</span>
                {section.items.map((item) => {
                  const active = adminNavItemActive(pathname, item.href);
                  const badge = item.morosoBadge ? (
                    <span className="admin-nav-badge">{morososCount > 99 ? "99+" : morososCount}</span>
                  ) : null;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`admin-nav-link ${active ? "admin-nav-link-active" : ""}`}
                      onClick={closeMenu}
                    >
                      <span className="admin-nav-icon-wrap">
                        <AdminNavIcon name={item.icon} />
                      </span>
                      <span className="admin-nav-label">{item.label}</span>
                      {badge}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {menuOpen && (
          <button type="button" className="admin-shell-backdrop" onClick={closeMenu} aria-label="Cerrar menú" />
        )}

        <main className="admin-shell-main">{children}</main>
      </div>
    </TrabajadorListaProvider>
  );
}
