"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/types/roles";
import DashboardNotifications from "@/components/DashboardNotifications";
import DashboardSettings from "@/components/DashboardSettings";
import InactivityLock from "@/components/InactivityLock";
import { DashboardHeaderProvider } from "@/context/DashboardHeaderContext";
import { getEmpresa } from "@/lib/empresa";
import type { ReactNode } from "react";
import type { EmpresaProfile } from "@/types/empresa";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, isEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [headerLeftSlot, setHeaderLeftSlot] = useState<ReactNode>(null);
  const [empresa, setEmpresa] = useState<EmpresaProfile | null>(null);

  const isGastosPage = pathname?.includes("/gastos") ?? false;
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
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
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
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Comprobando tu cuenta…</p>
      </div>
    );
  }

  const showEmpresaEnHeader = (isJefe || isTrabajador || isAdmin) && (empresa?.nombre?.trim() || empresa?.logo?.trim());
  const nombreEmpresa = empresa?.nombre?.trim() || "Empresa";
  const empresaLinkHref = isJefe ? "/dashboard/jefe/inicio" : isTrabajador ? "/dashboard/trabajador" : "/dashboard/admin";
  const empresaCompact = isTrabajador || isAdmin;

  return (
    <InactivityLock>
      <DashboardHeaderProvider value={setHeaderLeftSlot}>
        <div className={`container container-dashboard${isGastosPage ? " dashboard-page-gastos" : ""}`}>
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
              <DashboardNotifications />
              <DashboardSettings />
            </div>
          </header>
          {children}
        </div>
      </DashboardHeaderProvider>
    </InactivityLock>
  );
}
