"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/trabajador/resumen/ResumenTrabajadorPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando resumen...</p>
      </div>
    ),
  }
);

export default function ResumenDelDiaPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando resumen...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
