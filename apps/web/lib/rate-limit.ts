import "server-only";
import { prisma } from "@movewise/db";

/**
 * Postgres-backed sliding-window rate limiter (RateLimitHit — one row per
 * attempt, not per key). Replaced an in-memory version specifically
 * because that doesn't work on a serverless deploy target: every
 * function invocation there is a fresh process with fresh memory, so an
 * in-memory limiter is close to a no-op in production as actually
 * deployed (see docs/deployment.md, docs/known-risks.md). A real shared
 * store existing at all (this app's own Postgres database, via
 * ADR-0005) is what made this fix possible without adding a new piece
 * of infrastructure just for rate limiting.
 *
 * Still a pragmatic middle ground, not the final answer: rows for a key
 * that never returns (e.g. a one-off signup attempt from an IP that
 * never comes back) are cleaned up opportunistically on that key's own
 * next hit, not on a schedule — a key that's hit exactly once leaves one
 * permanent row. Fine at this app's current scale (each row is a cuid +
 * a short string + a timestamp); a real cleanup job would be the next
 * step if that ever matters.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Only set when allowed is false. */
  retryAfterMs?: number;
}

export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  const hitsInWindow = await prisma.rateLimitHit.findMany({
    where: { key, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (hitsInWindow.length >= limit) {
    const retryAfterMs = hitsInWindow[0]!.createdAt.getTime() + windowMs - now.getTime();
    return { allowed: false, retryAfterMs };
  }

  await prisma.rateLimitHit.create({ data: { key } });
  // Opportunistic cleanup, scoped to this key only — cheap (uses the
  // same @@index([key, createdAt])), and self-limiting: a key that never
  // returns just never gets cleaned, which is the accepted gap noted
  // above, not a bug in this line.
  await prisma.rateLimitHit.deleteMany({ where: { key, createdAt: { lte: windowStart } } });

  return { allowed: true };
}

export function formatRetryAfter(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
