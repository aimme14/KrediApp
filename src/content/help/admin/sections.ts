import type { AdminHelpPageKey } from "./pages";

export type AdminHelpSectionKey = AdminHelpPageKey | "general";

export type AdminHelpSection = {
  key: AdminHelpSectionKey;
  label: string;
};

/** Secciones del centro de ayuda, en el mismo orden que el menú lateral. */
export const ADMIN_HELP_SECTIONS: AdminHelpSection[] = [
  { key: "general", label: "Guía general" },
  { key: "inicio", label: "Inicio" },
  { key: "ruta-del-dia", label: "Ruta del día" },
  { key: "prestamo", label: "Préstamos" },
  { key: "solicitudes-prestamo", label: "Solicitudes préstamo" },
  { key: "reportes-dia", label: "Reportes del día" },
  { key: "cliente", label: "Clientes" },
  { key: "empleado", label: "Empleados" },
  { key: "rutas", label: "Rutas" },
  { key: "gastos", label: "Gastos operativos" },
  { key: "gestion-financiera", label: "Inversiones" },
  { key: "resumen", label: "Resumen económico" },
  { key: "cliente-moroso", label: "Clientes morosos" },
  { key: "permisos", label: "Permisos" },
];
