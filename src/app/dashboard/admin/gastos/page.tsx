"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/admin/gastos/GastosAdminPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando gastos...</p>
      </div>
    ),
  }
);

export default function GastosPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando gastos...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
