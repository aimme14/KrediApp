"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TrabajadorDashboardPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/trabajador/ruta");
  }, [router]);
  return <div className="card"><p>Redirigiendo...</p></div>;
}
