"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const ReportesDiaPageContent = dynamic(
  () => import("@/components/admin/reportes-dia/ReportesDiaPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando reportes del día...</p>
      </div>
    ),
  }
);

export default function ReportesDiaPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando reportes del día...</p>
        </div>
      }
    >
      <ReportesDiaPageContent />
    </Suspense>
  );
}
