"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/types/roles";
import Logo from "@/components/Logo";
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

  useEffect(() => {
    if (!isJefe || !profile?.uid) return;
    let cancelled = false;
    getEmpresa(profile.uid)
      .then((data) => {
        if (!cancelled && data) setEmpresa(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isJefe, profile?.uid]);

  if (loading || !profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  const showEmpresaEnHeader = isJefe && (empresa?.nombre?.trim() || empresa?.logo?.trim());
  const nombreEmpresa = empresa?.nombre?.trim() || "Empresa";

  return (
    <InactivityLock>
      <DashboardHeaderProvider value={setHeaderLeftSlot}>
        <div className={`container container-dashboard${isGastosPage ? " dashboard-page-gastos" : ""}`}>
          <header className="dashboard-header">
            <div className="header-left">
              {headerLeftSlot}
              {showEmpresaEnHeader ? (
                <Link href="/dashboard/jefe/inicio" className="dashboard-header-empresa" aria-label={`${nombreEmpresa} - Inicio`}>
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
              ) : (
                <Link href="/dashboard" style={{ display: "flex", alignItems: "center" }} aria-label="KrediApp - Inicio">
                  <Logo variant="header" />
                </Link>
              )}
              <span className={`badge badge-${profile.role} dashboard-header-badge`} style={{ textTransform: "capitalize" }}>
                {roleLabel(profile.role)}
              </span>
            </div>
            <div className="header-right">
              <DashboardSettings />
              <Link href="/dashboard" className="dashboard-header-logo-plataforma" aria-label="KrediApp">
                <Logo variant="header" />
              </Link>
            </div>
          </header>
          {children}
        </div>
      </DashboardHeaderProvider>
    </InactivityLock>
  );
}
