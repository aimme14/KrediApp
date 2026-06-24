"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/trabajador/prestamo/PrestamoTrabajadorPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando préstamos...</p>
      </div>
    ),
  }
);

export default function PrestamoTrabajadorPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando préstamos...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
