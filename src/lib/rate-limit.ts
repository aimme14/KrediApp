/**
 * rate-limit.ts
 *
 * Instancias de Ratelimit por tier de criticidad.
 * Algoritmo: slidingWindow para todos (previene bursts dobles en bordes de ventana).
 * Excepción: pagos usa tokenBucket para absorber ráfagas legítimas de cobradores.
 *
 * Keys prefijadas con "kredi:rl:" para evitar colisiones si se comparte la DB Redis.
 *
 * Fail-open/closed:
 *   - Tier 1 (auth, admin-ops, financial-write): fail-closed → bloquea si Redis cae.
 *   - Tier 2+ (lecturas, PDFs): fail-open → deja pasar si Redis cae.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ─── Cliente Redis ──────────────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeLimiter(
  requests: number,
  window: `${number} ${"ms" | "s" | "m" | "h" | "d"}`,
  prefix: string,
  ephemeralCache?: Map<string, number>
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `kredi:rl:${prefix}`,
    ephemeralCache,
    analytics: false,
  });
}

// ─── Cache ephémera por limiter (Bug 3 fix) ────────────────────────────────
// Cache SEPARADA por cada limiter para que un bloqueo en un tier no contamine
// el cache de otro tier. El identifier de Upstash incluye el prefijo Redis,
// pero el ephemeralCache local no — sin Maps separados, anular-bloqueado puede
// devolver cacheHit cuando se consulta read, que tiene límite mucho más alto.
const cacheAuth      = new Map<string, number>();
const cacheSetup     = new Map<string, number>();
const cacheAdminOps  = new Map<string, number>();
const cacheFinWrite  = new Map<string, number>();
const cachePagos     = new Map<string, number>();
const cacheAnular    = new Map<string, number>();
const cachePdf       = new Map<string, number>();
const cacheRead      = new Map<string, number>();

// ─── Tier 1 — Auth / sync-claims ───────────────────────────────────────────
// 20 req/min por IP en middleware; 10 req/min por usuario en handler.
export const authLimiterIP   = makeLimiter(20, "1 m", "auth:ip",   cacheAuth);
export const authLimiterUser = makeLimiter(10, "1 m", "auth:user");

// ─── Tier 1 — Setup super-admin (riesgo de takeover) ───────────────────────
// Solo 5 req/hora por IP. Combinado con SETUP_SECRET en el handler.
export const setupLimiterIP = makeLimiter(5, "1 h", "setup:ip", cacheSetup);

// ─── Tier 1 — Operaciones de administración (enable/disable, create user) ──
// 20 req/min por IP (withRateLimit por usuario solo en rutas con Bearer auth).
export const adminOpsLimiterIP   = makeLimiter(20, "1 m", "admin-ops:ip",   cacheAdminOps);
export const adminOpsLimiterUser = makeLimiter(10, "1 m", "admin-ops:user");

// ─── Tier 1 — Escrituras financieras (invertir, transferir, gastos, períodos) ─
// 30 req/min por IP; 20 req/min por usuario.
export const financialWriteLimiterIP   = makeLimiter(30, "1 m", "fin-write:ip",   cacheFinWrite);
export const financialWriteLimiterUser = makeLimiter(20, "1 m", "fin-write:user");

// ─── Tier 1 — Pagos POST (cobro en campo) ──────────────────────────────────
// Relajado: cobradores pueden hacer muchos pagos seguidos legítimamente.
// 120 req/min por IP (varios cobradores en WiFi/CGNAT); 90 req/min por usuario.
export const pagosLimiterIP = new Ratelimit({
  redis,
  limiter: Ratelimit.tokenBucket(120, "1 m", 120),
  prefix: "kredi:rl:pagos:ip",
  ephemeralCache: cachePagos,
  analytics: false,
});
export const pagosLimiterUser = new Ratelimit({
  redis,
  limiter: Ratelimit.tokenBucket(90, "1 m", 90),
  prefix: "kredi:rl:pagos:user",
  analytics: false,
});

// ─── Tier 1 — Anular pago (irreversible) ───────────────────────────────────
// Estricto: 10 req/min por IP; 5 req/min por usuario.
export const anularLimiterIP   = makeLimiter(10, "1 m", "anular:ip",   cacheAnular);
export const anularLimiterUser = makeLimiter(5,  "1 m", "anular:user");

// ─── Tier 2 — PDFs / exports (pesados en CPU) ──────────────
// 10 req/min por IP; 5 req/min por usuario (disponible para uso futuro).
export const pdfLimiterIP   = makeLimiter(10, "1 m", "pdf:ip",   cachePdf);
export const pdfLimiterUser = makeLimiter(5,  "1 m", "pdf:user");

// ─── Tier 3 — Lecturas generales ─────────────────────
// Holgado: 200 req/min por IP (fail-open si Redis cae).
export const readLimiterIP = makeLimiter(200, "1 m", "read:ip", cacheRead);
