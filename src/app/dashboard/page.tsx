"use client";

import { useAuth } from "@/context/AuthContext";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import JefeDashboard from "@/components/dashboard/JefeDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import TrabajadorDashboard from "@/components/dashboard/TrabajadorDashboard";

export default function DashboardPage() {
  const { profile } = useAuth();

  if (!profile) return null;

  switch (profile.role) {
    case "superAdmin":
      return <SuperAdminDashboard />;
    case "jefe":
      return <JefeDashboard />;
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
