"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/admin/gestion-financiera/GestionFinancieraPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando gestión financiera...</p>
      </div>
    ),
  }
);

export default function GestionFinancieraPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando gestión financiera...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
