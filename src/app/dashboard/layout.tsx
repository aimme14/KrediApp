"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/types/roles";
import DashboardSettings from "@/components/DashboardSettings";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, isEnabled } = useAuth();
  const router = useRouter();

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

  const pathname = usePathname();
  const isGastosPage = pathname?.includes("/gastos") ?? false;

  return (
    <div className={`container${isGastosPage ? " dashboard-page-gastos" : ""}`} style={{ paddingTop: "1rem" }}>
      <header className="dashboard-header">
        <div className="header-left">
          <Link href="/dashboard" style={{ fontWeight: 600, color: "var(--text)" }}>
            KrediApp
          </Link>
          <span className={`badge badge-${profile.role}`} style={{ textTransform: "capitalize" }}>
            {roleLabel(profile.role)}
          </span>
        </div>
        <div className="header-right">
          <DashboardSettings />
        </div>
      </header>
      {children}
    </div>
  );
}
