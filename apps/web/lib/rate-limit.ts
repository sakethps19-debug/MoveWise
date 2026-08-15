import "server-only";

/**
 * In-memory sliding-window rate limiter. A deliberate stopgap, not a
 * production-grade solution: it's per-process state, so it resets on
 * every deploy/restart and doesn't share state across multiple server
 * instances. That's an accepted gap tracked in docs/known-risks.md,
 * consistent with SQLite being a dev-only datastore for the same reason
 * (see ADR-0002) — a real fix needs a shared store (e.g. Redis) and
 * should land together with the Postgres/hosting migration, not before.
 *
 * Good enough today to stop naive automated credential-stuffing and
 * signup-spam bots, which is the actual risk this closes.
 */

const hits = new Map<string, number[]>();

// Bound memory: without this, an attacker cycling through unique keys
// (e.g. spoofed IPs) could grow this map indefinitely.
const MAX_TRACKED_KEYS = 50_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Only set when allowed is false. */
  retryAfterMs?: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = hits.get(key);
  timestamps = timestamps ? timestamps.filter((t) => t > windowStart) : [];

  if (timestamps.length >= limit) {
    const retryAfterMs = timestamps[0]! + windowMs - now;
    hits.set(key, timestamps);
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  if (hits.size >= MAX_TRACKED_KEYS && !hits.has(key)) {
    // Drop the oldest-inserted key to bound memory. Map preserves
    // insertion order, so the first key is the oldest.
    const oldestKey = hits.keys().next().value;
    if (oldestKey !== undefined) hits.delete(oldestKey);
  }
  hits.set(key, timestamps);
  return { allowed: true };
}

export function formatRetryAfter(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
