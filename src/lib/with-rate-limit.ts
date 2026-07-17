/**
 * with-rate-limit.ts
 *
 * HOF (Higher-Order Function) para aplicar rate limiting por usuario autenticado
 * dentro de un route handler Node.js (NO Edge).
 *
 * Aquí sí podemos usar firebase-admin / verifyIdToken para extraer el uid,
 * a diferencia del middleware Edge donde eso no está disponible.
 *
 * Uso:
 *   export const POST = withRateLimit(pagosLimiterUser, async (req) => { ... });
 *
 * Si el usuario no está autenticado, el handler devuelve 401 antes de llegar aquí.
 * Si Redis cae con failClosed=true, devuelve 503 (servicio no disponible).
 */

import { NextRequest, NextResponse } from "next/server";
import type { Ratelimit } from "@upstash/ratelimit";
import { getApiUser } from "@/lib/api-auth";
import { rateLimitEnabled } from "@/lib/rate-limit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: NextRequest, ctx: any) => Promise<NextResponse> | NextResponse;

/**
 * @param limiter     Instancia de Ratelimit (por usuario) de rate-limit.ts
 * @param handler     El handler original del route
 * @param failClosed  Si Redis falla, ¿bloquear (true) o dejar pasar (false)?
 *                    Default: true (recomendado para Tier 1 financiero)
 */
export function withRateLimit(
  limiter: Ratelimit,
  handler: RouteHandler,
  failClosed = true
): RouteHandler {
  return async (req, ctx) => {
    // Sin Redis configurado no hay rate limiting que aplicar (p. ej. dev local).
    if (!rateLimitEnabled) return handler(req, ctx);

    // Extraer uid del token Firebase verificado
    const apiUser = await getApiUser(req);

    // Si no hay token válido, el handler lo rechazará con 401.
    // Aquí solo aplicamos el límite si hay uid conocido.
    const identifier = apiUser ? `uid:${apiUser.uid}` : `anon:${req.ip ?? "unknown"}`;

    try {
      const result = await limiter.limit(identifier);

      if (!result.success) {
        const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
        return NextResponse.json(
          {
            error: "Demasiadas solicitudes. Por favor espera antes de intentarlo de nuevo.",
            retryAfter,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfter),
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": String(result.remaining),
              "X-RateLimit-Reset": String(result.reset),
            },
          }
        );
      }
    } catch {
      // Redis caído
      if (failClosed) {
        return NextResponse.json(
          { error: "Servicio temporalmente no disponible. Intenta en unos segundos." },
          { status: 503, headers: { "Retry-After": "30" } }
        );
      }
      // fail-open: continúa sin rate limit
    }

    return handler(req, ctx);
  };
}
