"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PrestamoAdminPageContent = dynamic(
  () => import("@/components/admin/prestamo/PrestamoAdminPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando préstamos...</p>
      </div>
    ),
  }
);

export default function PrestamoPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando préstamos...</p>
        </div>
      }
    >
      <PrestamoAdminPageContent />
    </Suspense>
  );
}
