import { ADMIN_HELP_GENERAL } from "./general";
import { ADMIN_HELP_PAGES, type AdminHelpPageKey } from "./pages";
import type { HelpPageContent } from "../types";

const ADMIN_ROUTE_PREFIX = "/dashboard/admin";

/** Rutas ordenadas de más específica a más general. */
const ADMIN_PATH_MATCHERS: { prefix: string; key: AdminHelpPageKey }[] = [
  { prefix: `${ADMIN_ROUTE_PREFIX}/solicitudes-prestamo`, key: "solicitudes-prestamo" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/gestion-financiera`, key: "gestion-financiera" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/cliente-moroso`, key: "cliente-moroso" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/ruta-del-dia`, key: "ruta-del-dia" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/reportes-dia`, key: "reportes-dia" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/prestamo`, key: "prestamo" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/resumen`, key: "resumen" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/cliente`, key: "cliente" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/empleado`, key: "empleado" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/rutas`, key: "rutas" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/gastos`, key: "gastos" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/permisos`, key: "permisos" },
  { prefix: `${ADMIN_ROUTE_PREFIX}/cobrar`, key: "cobrar" },
  { prefix: ADMIN_ROUTE_PREFIX, key: "inicio" },
];

export function resolveAdminHelpPageKey(pathname: string | null | undefined): AdminHelpPageKey {
  const path = pathname ?? "";
  if (!path.startsWith(ADMIN_ROUTE_PREFIX)) return "inicio";

  for (const { prefix, key } of ADMIN_PATH_MATCHERS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  return "inicio";
}

export function getAdminHelpPage(key: AdminHelpPageKey): HelpPageContent {
  return ADMIN_HELP_PAGES[key];
}

export function getAdminHelpForPathname(pathname: string | null | undefined): HelpPageContent {
  return getAdminHelpPage(resolveAdminHelpPageKey(pathname));
}

export { ADMIN_HELP_GENERAL };
