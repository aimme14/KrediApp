"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/trabajador/gastos/GastosTrabajadorPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando gastos...</p>
      </div>
    ),
  }
);

export default function GastosTrabajadorPage() {
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
