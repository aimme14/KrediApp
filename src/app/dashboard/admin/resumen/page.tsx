"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/admin/resumen/ResumenAdminPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando resumen...</p>
      </div>
    ),
  }
);

export default function ResumenPage() {
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
