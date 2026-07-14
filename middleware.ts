/**
 * middleware.ts — Rate limiting por IP en el Edge (Vercel Edge Runtime).
 *
 * Corre ANTES de cada route handler. Solo aplica límite por IP aquí;
 * el límite por usuario (uid) se aplica dentro de cada handler con withRateLimit
 * porque en Edge no tenemos firebase-admin para verificar el token.
 *
 * Política de fail-open / fail-closed:
 *   - Tier 1 (auth, setup, admin-ops, escrituras financieras): fail-closed.
 *     Si Redis cae, bloqueamos para proteger la integridad financiera.
 *   - Tier 2+ (PDFs, lecturas): fail-open.
 *     Si Redis cae, dejamos pasar para no interrumpir operación normal.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authLimiterIP,
  setupLimiterIP,
  adminOpsLimiterIP,
  financialWriteLimiterIP,
  pagosLimiterIP,
  anularLimiterIP,
  pdfLimiterIP,
  readLimiterIP,
} from "@/lib/rate-limit";
import type { Ratelimit } from "@upstash/ratelimit";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getIP(req: NextRequest): string {
  // Vercel controla x-forwarded-for — es seguro usarlo.
  return req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function rateLimitedResponse(reset: number, serviceUnavailable = false): NextResponse {
  const retryAfter = Math.ceil((reset - Date.now()) / 1000);
  return NextResponse.json(
    {
      error: serviceUnavailable
        ? "Servicio temporalmente no disponible. Intenta en unos segundos."
        : "Demasiadas solicitudes. Por favor espera antes de intentarlo de nuevo.",
      retryAfter,
    },
    {
      status: serviceUnavailable ? 503 : 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Reset": String(reset),
      },
    }
  );
}

async function applyLimit(
  limiter: Ratelimit,
  identifier: string,
  failClosed: boolean
): Promise<{ blocked: boolean; reset: number; serviceUnavailable?: boolean }> {
  try {
    const result = await limiter.limit(identifier);
    return { blocked: !result.success, reset: result.reset };
  } catch {
    // Redis caído
    if (failClosed) {
      return { blocked: true, reset: Date.now() + 30_000, serviceUnavailable: true };
    }
    return { blocked: false, reset: 0 };
  }
}

// ─── Classifier de rutas ─────────────────────────────────────────────────────

type Tier =
  | "auth"
  | "setup"
  | "admin-ops"
  | "financial-write"
  | "pagos"
  | "anular"
  | "pdf"
  | "read"
  | "skip"; // cron u otras rutas excluidas

function classifyPath(pathname: string, method: string): Tier {
  // Excluir cron (protegido por CRON_SECRET propio)
  if (pathname.startsWith("/api/cron/")) return "skip";

  // Fcm-token: poco riesgo financiero, tráfico de background
  if (pathname.startsWith("/api/user/fcm-token")) return "skip";

  // Auth / sync-claims
  if (pathname === "/api/users/me/sync-claims") return "auth";

  // Setup super-admin (takeover risk)
  if (pathname === "/api/setup/super-admin") return "setup";

  // Crear usuario / enable-disable
  if (pathname === "/api/users/create") return "admin-ops";
  if (pathname.includes("/enabled")) return "admin-ops";

  // Anular pago (irreversible, estricto)
  if (pathname.includes("/anular")) return "anular";

  // Pagos POST (cobro en campo — relajado, solo en escritura)
  if (pathname.match(/\/prestamos\/[^/]+\/pagos$/) && method === "POST") return "pagos";

  // Escrituras financieras críticas
  if (
    pathname.includes("/invertir") ||
    pathname.includes("/transferir") ||
    pathname.includes("/ingresar-base") ||
    pathname.includes("/asignar-base") ||
    (pathname.includes("/gastos") && method === "POST") ||
    pathname.includes("/abrir") ||
    pathname.includes("/cerrar") ||
    pathname.includes("/aprobar") ||
    pathname.includes("/rechazar") ||
    pathname.includes("/evaluar") ||
    (pathname.includes("/clientes") && method === "POST") ||
    (pathname.includes("/rutas") && method === "POST") ||
    (pathname.includes("/prestamos") && method === "POST") ||
    pathname.includes("/empresas-acceso") ||
    pathname.includes("/acceso") ||
    pathname.includes("/entregar-reporte") ||
    pathname.includes("/sync-moroso")
  )
    return "financial-write";

  // PDFs / exports (pesados en CPU)
  if (
    pathname.includes("/pdf") ||
    pathname.includes("/export") ||
    pathname.includes("/regenerar-pdf")
  )
    return "pdf";

  // Todo lo demás: lecturas generales
  return "read";
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Solo actúa sobre rutas /api/
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const tier = classifyPath(pathname, method);
  if (tier === "skip") return NextResponse.next();

  const ip = getIP(req);

  const tierConfig: Record<
    Exclude<Tier, "skip">,
    { limiter: Ratelimit; failClosed: boolean }
  > = {
    auth: { limiter: authLimiterIP, failClosed: true },
    setup: { limiter: setupLimiterIP, failClosed: true },
    "admin-ops": { limiter: adminOpsLimiterIP, failClosed: true },
    "financial-write": { limiter: financialWriteLimiterIP, failClosed: true },
    pagos: { limiter: pagosLimiterIP, failClosed: true },
    anular: { limiter: anularLimiterIP, failClosed: true },
    pdf: { limiter: pdfLimiterIP, failClosed: false },
    read: { limiter: readLimiterIP, failClosed: false },
  };

  const { limiter, failClosed } = tierConfig[tier];
  const { blocked, reset, serviceUnavailable } = await applyLimit(limiter, ip, failClosed);

  if (blocked) return rateLimitedResponse(reset, serviceUnavailable);

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
