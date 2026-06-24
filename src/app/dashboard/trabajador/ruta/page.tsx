"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const TrabajadorRutaPageContent = dynamic(
  () => import("@/components/trabajador/ruta/TrabajadorRutaPageContent"),
  {
    ssr: false,
    loading: () => (
      <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
        <p>Cargando ruta...</p>
      </div>
    ),
  }
);

export default function TrabajadorRutaPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <p>Cargando ruta...</p>
        </div>
      }
    >
      <TrabajadorRutaPageContent />
    </Suspense>
  );
}
