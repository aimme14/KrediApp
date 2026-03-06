"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/admin/rutas");
  }, [router]);

  return (
    <div className="card">
      <p>Redirigiendo al panel administrador...</p>
    </div>
  );
}
