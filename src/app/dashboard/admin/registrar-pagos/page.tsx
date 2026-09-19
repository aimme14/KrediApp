"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const RegistrarPagosAdminPageContent = dynamic(
  () => import("@/components/admin/registrar-pagos/RegistrarPagosAdminPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando registrar pagos...</p>
      </div>
    ),
  }
);

export default function RegistrarPagosAdminPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando registrar pagos...</p>
        </div>
      }
    >
      <RegistrarPagosAdminPageContent />
    </Suspense>
  );
}
