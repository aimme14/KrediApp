"use client";

import CobrarClientePage from "@/app/dashboard/trabajador/cobrar/page";

/**
 * Página de registro de cobro para el administrador.
 * Reutiliza la misma lógica que el trabajador; el back link y el rol se detectan por la ruta (/admin/).
 */
export default function AdminCobrarPage() {
  return <CobrarClientePage />;
}
