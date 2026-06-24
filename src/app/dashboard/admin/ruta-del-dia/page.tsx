"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const RutaDelDiaAdminPageContent = dynamic(
  () => import("@/components/admin/ruta-del-dia/RutaDelDiaAdminPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando ruta del día...</p>
      </div>
    ),
  }
);

export default function RutaDelDiaPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando ruta del día...</p>
        </div>
      }
    >
      <RutaDelDiaAdminPageContent />
    </Suspense>
  );
}
