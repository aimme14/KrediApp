"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/types/roles";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, isEnabled, signOut } = useAuth();
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

  return (
    <div className="container" style={{ paddingTop: "1rem" }}>
      <header className="flex justify-between items-center mb-2" style={{ marginBottom: "1.5rem" }}>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" style={{ fontWeight: 600, color: "#e4e4e7" }}>
            KrediApp
          </Link>
          <span className={`badge badge-${profile.role}`} style={{ textTransform: "capitalize" }}>
            {roleLabel(profile.role)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "#a1a1aa", fontSize: "0.875rem" }}>{profile.email}</span>
          <button type="button" className="btn btn-secondary" onClick={() => signOut()}>
            Cerrar sesión
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
