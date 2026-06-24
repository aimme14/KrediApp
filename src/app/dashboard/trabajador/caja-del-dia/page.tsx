"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/trabajador/caja-del-dia/CajaDelDiaPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando caja del día...</p>
      </div>
    ),
  }
);

export default function CajaDelDiaPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando caja del día...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
