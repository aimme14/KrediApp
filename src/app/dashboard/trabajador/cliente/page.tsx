"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const PageContent = dynamic(
  () => import("@/components/trabajador/cliente/ClienteTrabajadorPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando clientes...</p>
      </div>
    ),
  }
);

export default function ClienteTrabajadorPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando clientes...</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
