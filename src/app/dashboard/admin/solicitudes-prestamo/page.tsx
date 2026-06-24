"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/admin/solicitudes-prestamo/SolicitudesPrestamoPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando solicitudes...</p>
      </div>
    ),
  }
);

export default function SolicitudesPrestamoAdminPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando solicitudes...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
