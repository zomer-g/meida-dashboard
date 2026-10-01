/**
 * In-memory rate limits for the MCP routes: enough to stop a loop or a probe,
 * per process (one process per channel here). Not a billing quota.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 5000;

export function rateLimit(key: string, max: number, windowMs = 60_000): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size > MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size > MAX_KEYS) buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  bucket.count++;
  return bucket.count <= max ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
}

/** Unauthenticated OAuth endpoints are the ones worth throttling hardest. */
export const OAUTH_LIMIT = 20;
export const TOOL_LIMIT = 120;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
