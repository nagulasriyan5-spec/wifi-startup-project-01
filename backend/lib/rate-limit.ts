import type { MiddlewareHandler } from "hono";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = 0;

function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip") || "unknown";
}

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    if (options.maxRequests === 0 || c.req.method === "OPTIONS") {
      await next();
      return;
    }

    const now = Date.now();
    cleanupExpiredBuckets(now);

    const key = getClientIp(c.req.raw.headers);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      await next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000),
      );
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json(
        {
          error: "Too many requests",
          retryAfterSeconds,
        },
        429,
      );
    }

    await next();
  };
}

export function getRateLimitStats() {
  cleanupExpiredBuckets(Date.now());

  return {
    trackedClients: buckets.size,
  };
}
