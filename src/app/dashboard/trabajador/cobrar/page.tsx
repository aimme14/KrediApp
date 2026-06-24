"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const CobrarClientePageContent = dynamic(
  () => import("@/components/trabajador/cobrar/CobrarClientePageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
        <p>Cargando cobro...</p>
      </div>
    ),
  }
);

/** useSearchParams requiere Suspense en el App Router para no dejar la ruta en blanco durante el render. */
export default function CobrarClientePage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
          <p>Cargando cobro...</p>
        </div>
      }
    >
      <CobrarClientePageContent />
    </Suspense>
  );
}
