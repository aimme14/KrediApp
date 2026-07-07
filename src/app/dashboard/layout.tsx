"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/types/roles";
import DashboardNotifications from "@/components/DashboardNotifications";
import InactivityLock from "@/components/InactivityLock";
import { DashboardHeaderProvider } from "@/context/DashboardHeaderContext";
import { GastoFcmCampanitaProvider } from "@/context/GastoFcmCampanitaContext";
import { OfflineRootEffect } from "@/components/OfflineRootEffect";
import { getEmpresa } from "@/lib/empresa";
import type { ReactNode } from "react";
import type { EmpresaProfile } from "@/types/empresa";

const DashboardHelp = dynamic(() => import("@/components/help/DashboardHelp"), { ssr: false });
const DashboardSettings = dynamic(() => import("@/components/DashboardSettings"), { ssr: false });
const TrialReminderCard = dynamic(() => import("@/components/TrialReminderCard"), { ssr: false });

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, authInitializing, profileLoading, error, isEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [headerLeftSlot, setHeaderLeftSlot] = useState<ReactNode>(null);
  const [empresa, setEmpresa] = useState<EmpresaProfile | null>(null);

  const isGastosPage = pathname?.includes("/gastos") ?? false;
  /** Jefe, admin y trabajador: sin tope de 720px (sidebar + contenido en escritorio) */
  const isDashboardShellFluid =
    (pathname?.startsWith("/dashboard/admin") ?? false) ||
    (pathname?.startsWith("/dashboard/jefe") ?? false) ||
    (pathname?.startsWith("/dashboard/trabajador") ?? false);
  const isJefe = profile?.role === "jefe";
  const isTrabajador = profile?.role === "trabajador";
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.push("/");
      return;
    }
    if (!isEnabled()) {
      router.push("/deshabilitado");
    }
  }, [user, profile, loading, isEnabled, router]);

  const empresaDocId = isJefe ? profile?.uid : profile?.empresaId;
  useEffect(() => {
    if (!empresaDocId) return;
    let cancelled = false;
    getEmpresa(empresaDocId)
      .then((data) => {
        if (!cancelled && data) setEmpresa(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [empresaDocId]);

  if (loading) {
    const msg = authInitializing
      ? "Conectando con tu cuenta…"
      : profileLoading
        ? "Cargando tu perfil desde el servidor…"
        : "Cargando…";
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>{msg}</p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "1rem", maxWidth: "28rem", marginInline: "auto" }}>
          Tras iniciar sesión, la primera carga puede tardar unos segundos. Si supera un minuto, revisa tu conexión o recarga la página.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Redirigiendo…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center", maxWidth: "24rem", marginInline: "auto" }}>
        <p>Comprobando tu cuenta…</p>
        {error?.trim() ? (
          <p style={{ color: "var(--danger, #c94a4a)", marginTop: "1rem", fontSize: "0.9rem" }}>{error}</p>
        ) : null}
      </div>
    );
  }

  const showEmpresaEnHeader = (isJefe || isTrabajador || isAdmin) && (empresa?.nombre?.trim() || empresa?.logo?.trim());
  const nombreEmpresa = empresa?.nombre?.trim() || "Empresa";
  const empresaLinkHref = isJefe ? "/dashboard/jefe/inicio" : isTrabajador ? "/dashboard/trabajador" : "/dashboard/admin";
  const empresaCompact = isTrabajador || isAdmin;

  return (
    <InactivityLock>
      <OfflineRootEffect />
      {(isJefe || isAdmin) ? <TrialReminderCard /> : null}
      <GastoFcmCampanitaProvider>
        <DashboardHeaderProvider value={setHeaderLeftSlot}>
          <div
            className={`container container-dashboard${isGastosPage ? " dashboard-page-gastos" : ""}${isDashboardShellFluid ? " container-dashboard--fluid" : ""}`}
          >
            <header className="dashboard-header">
              <div className="header-left">
                {headerLeftSlot}
                {showEmpresaEnHeader ? (
                  <Link
                    href={empresaLinkHref}
                    className={`dashboard-header-empresa ${empresaCompact ? "dashboard-header-empresa-compact" : ""}`}
                    aria-label={`${nombreEmpresa} - Inicio`}
                  >
                    <div className="dashboard-header-empresa-logo">
                      {empresa?.logo ? (
                        <img src={empresa.logo} alt="" />
                      ) : (
                        <span className="dashboard-header-empresa-iniciales">
                          {nombreEmpresa.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="dashboard-header-empresa-nombre">{nombreEmpresa}</span>
                  </Link>
                ) : null}
                <span className={`badge badge-${profile.role} dashboard-header-badge`} style={{ textTransform: "capitalize" }}>
                  {roleLabel(profile.role)}
                </span>
              </div>
              <div className="header-right">
                {isAdmin ? <DashboardHelp /> : null}
                <DashboardNotifications />
                <DashboardSettings />
              </div>
            </header>
            {children}
          </div>
        </DashboardHeaderProvider>
      </GastoFcmCampanitaProvider>
    </InactivityLock>
  );
}
