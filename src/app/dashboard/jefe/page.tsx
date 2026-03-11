"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function JefeHubPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/jefe/inicio");
  }, [router]);

  return (
    <div className="card">
      <p>Cargando...</p>
    </div>
  );
}
