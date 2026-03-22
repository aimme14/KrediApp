"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (profile?.role === "jefe") {
      router.replace("/dashboard/jefe");
      return;
    }
    if (profile?.role === "admin") {
      router.replace("/dashboard/admin");
      return;
    }
    if (profile?.role === "trabajador") {
      router.replace("/dashboard/trabajador");
      return;
    }
  }, [profile, router]);

  if (loading || !profile) {
    return (
      <div className="card">
        <p>{loading ? "Cargando panel..." : "Preparando panel..."}</p>
      </div>
    );
  }

  if (profile.role === "jefe") {
    return (
      <div className="card">
        <p>Redirigiendo al panel jefe...</p>
      </div>
    );
  }
  if (profile.role === "admin") {
    return <div className="card"><p>Redirigiendo al panel administrador...</p></div>;
  }
  if (profile.role === "trabajador") {
    return <div className="card"><p>Redirigiendo al panel trabajador...</p></div>;
  }

  switch (profile.role) {
    case "superAdmin":
      return <SuperAdminDashboard />;
    default:
      return (
        <div className="card">
          <p>Rol no reconocido. Contacta al administrador.</p>
        </div>
      );
  }
}
