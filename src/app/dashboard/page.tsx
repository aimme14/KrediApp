"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import TrabajadorDashboard from "@/components/dashboard/TrabajadorDashboard";

export default function DashboardPage() {
  const { profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (profile?.role === "jefe") {
      router.replace("/dashboard/jefe");
      return;
    }
  }, [profile, router]);

  if (!profile) return null;

  if (profile.role === "jefe") {
    return (
      <div className="card">
        <p>Redirigiendo al panel jefe...</p>
      </div>
    );
  }

  switch (profile.role) {
    case "superAdmin":
      return <SuperAdminDashboard />;
    case "admin":
      return <AdminDashboard />;
    case "trabajador":
      return <TrabajadorDashboard />;
    default:
      return (
        <div className="card">
          <p>Rol no reconocido. Contacta al administrador.</p>
        </div>
      );
  }
}
