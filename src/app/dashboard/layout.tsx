"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/types/roles";
import Logo from "@/components/Logo";
import DashboardSettings from "@/components/DashboardSettings";
import { DashboardHeaderProvider } from "@/context/DashboardHeaderContext";
import type { ReactNode } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, isEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [headerLeftSlot, setHeaderLeftSlot] = useState<ReactNode>(null);

  const isGastosPage = pathname?.includes("/gastos") ?? false;

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

  if (loading || !profile) {
    return (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <DashboardHeaderProvider value={setHeaderLeftSlot}>
      <div className={`container container-dashboard${isGastosPage ? " dashboard-page-gastos" : ""}`}>
        <header className="dashboard-header">
          <div className="header-left">
            {headerLeftSlot}
            <Link href="/dashboard" style={{ display: "flex", alignItems: "center" }} aria-label="KrediApp - Inicio">
              <Logo variant="header" />
            </Link>
          <span className={`badge badge-${profile.role} dashboard-header-badge`} style={{ textTransform: "capitalize" }}>
            {roleLabel(profile.role)}
          </span>
        </div>
        <div className="header-right">
          <DashboardSettings />
        </div>
      </header>
      {children}
    </div>
    </DashboardHeaderProvider>
  );
}
