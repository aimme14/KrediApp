"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/admin/empleado/EmpleadoAdminPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando empleados...</p>
      </div>
    ),
  }
);

export default function EmpleadoPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando empleados...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
