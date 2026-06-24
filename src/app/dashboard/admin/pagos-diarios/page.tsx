"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PagosDiariosPageContent = dynamic(
  () => import("@/components/admin/pagos-diarios/PagosDiariosPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando pagos diarios...</p>
      </div>
    ),
  }
);

export default function PagosDiariosPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando pagos diarios...</p>
        </div>
      }
    >
      <PagosDiariosPageContent />
    </Suspense>
  );
}
