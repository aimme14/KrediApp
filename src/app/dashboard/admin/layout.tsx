"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useDashboardHeaderSlot } from "@/context/DashboardHeaderContext";
import { AdminNotificacionesRealtimeListener } from "@/components/AdminNotificacionesRealtimeListener";
import { TrabajadorListaProvider, useTrabajadorLista } from "@/context/TrabajadorListaContext";
import { useGastoFcmCampanita } from "@/context/GastoFcmCampanitaContext";
import { TrabajadorCajaDiaProvider } from "@/context/TrabajadorCajaDiaContext";
import { AdminDashboardProvider } from "@/context/AdminDashboardContext";
import { ADMIN_NAV_ITEMS, AdminNavIcon } from "@/components/admin/adminNavConfig";
import { TrabajadorSyncBanner } from "@/components/TrabajadorSyncBanner";
import { isAdminPanelRole } from "@/lib/admin-panel-role";

const AdminFcmRegistration = dynamic(
  () => import("@/components/AdminFcmRegistration").then((m) => ({ default: m.AdminFcmRegistration })),
  { ssr: false }
);

const AdminNovedadPrestamosDelete = dynamic(
  () =>
    import("@/components/admin/AdminNovedadPrestamosDelete").then((m) => ({
      default: m.AdminNovedadPrestamosDelete,
    })),
  { ssr: false }
);

function adminNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard/admin") return pathname === "/dashboard/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, error, isEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const { clientes } = useTrabajadorLista();
  const { solicitudesPrestamoPendientesCount } = useGastoFcmCampanita();
  const morososCount = useMemo(
    () => clientes.filter((c) => c.moroso === true).length,
    [clientes]
  );

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.push("/");
      return;
    }
    if (!isAdminPanelRole(profile.role)) {
      router.push("/dashboard");
      return;
    }
    if (!isEnabled()) {
      router.push("/deshabilitado");
    }
  }, [user, profile, loading, isEnabled, router]);

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

  if (!isAdminPanelRole(profile.role)) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Redirigiendo al panel…</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <AdminFcmRegistration />
      <AdminNovedadPrestamosDelete />
      <aside
        className={`admin-sidebar ${menuOpen ? "admin-sidebar-open" : ""}`}
        aria-label="Navegación del administrador"
      >
        <div className="admin-sidebar-inner">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = adminNavItemActive(pathname, item.href);
            const badge = item.morosoBadge ? (
              <span className="admin-nav-badge">{morososCount > 99 ? "99+" : morososCount}</span>
            ) : item.solicitudesPrestamoBadge && solicitudesPrestamoPendientesCount > 0 ? (
              <span className="admin-nav-badge">
                {solicitudesPrestamoPendientesCount > 99 ? "99+" : solicitudesPrestamoPendientesCount}
              </span>
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
      </aside>

      {menuOpen && (
        <button type="button" className="admin-shell-backdrop" onClick={closeMenu} aria-label="Cerrar menú" />
      )}

      <main className="admin-shell-main">
        <TrabajadorSyncBanner />
        {children}
      </main>

      <nav className="admin-mobile-tabbar" aria-label="Accesos rápidos">
        <Link
          href="/dashboard/admin"
          className={`admin-mobile-tabbar-item${adminNavItemActive(pathname, "/dashboard/admin") ? " admin-mobile-tabbar-item-active" : ""}`}
          onClick={closeMenu}
        >
          <span className="admin-mobile-tabbar-icon-wrap">
            <AdminNavIcon name="home" />
          </span>
          <span className="admin-mobile-tabbar-label">Inicio</span>
        </Link>
        <Link
          href="/dashboard/admin/rutas"
          className={`admin-mobile-tabbar-item${adminNavItemActive(pathname, "/dashboard/admin/rutas") ? " admin-mobile-tabbar-item-active" : ""}`}
          onClick={closeMenu}
        >
          <span className="admin-mobile-tabbar-icon-wrap">
            <AdminNavIcon name="route" />
          </span>
          <span className="admin-mobile-tabbar-label">Rutas</span>
        </Link>
        <Link
          href="/dashboard/admin/ruta-del-dia"
          className={`admin-mobile-tabbar-item${adminNavItemActive(pathname, "/dashboard/admin/ruta-del-dia") ? " admin-mobile-tabbar-item-active" : ""}`}
          onClick={closeMenu}
        >
          <span className="admin-mobile-tabbar-icon-wrap">
            <AdminNavIcon name="ruta-dia" />
          </span>
          <span className="admin-mobile-tabbar-label">Ruta del día</span>
        </Link>
        <button
          type="button"
          className={`admin-mobile-tabbar-item${menuOpen ? " admin-mobile-tabbar-item-active" : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Cerrar menú lateral" : "Abrir menú lateral"}
        >
          <span className="admin-mobile-tabbar-icon-wrap">
            <AdminNavIcon name="more" />
          </span>
          <span className="admin-mobile-tabbar-label">Más</span>
        </button>
      </nav>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <TrabajadorListaProvider>
      <AdminNotificacionesRealtimeListener />
      <TrabajadorCajaDiaProvider>
        <AdminDashboardProvider>
          <AdminLayoutInner>{children}</AdminLayoutInner>
        </AdminDashboardProvider>
      </TrabajadorCajaDiaProvider>
    </TrabajadorListaProvider>
  );
}
