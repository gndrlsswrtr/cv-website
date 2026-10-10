/**
 * In-memory login throttling.
 *
 * Single-process and deliberately simple: it stops online password guessing
 * against one deployment. It resets on restart, which is an acceptable trade
 * for a single-admin portfolio site (documented in README).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

function bucketFor(key: string, windowMs: number): Bucket {
  const existing = buckets.get(key);
  const nowMs = Date.now();
  if (existing && existing.resetAt > nowMs) return existing;

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size >= MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= nowMs) buckets.delete(k);
    }
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
  }

  const fresh: Bucket = { count: 0, resetAt: nowMs + windowMs };
  buckets.set(key, fresh);
  return fresh;
}

/** Records an attempt. Returns `true` when the caller is still allowed. */
export function registerAttempt(key: string, limit: number, windowMs: number): boolean {
  const bucket = bucketFor(key, windowMs);
  bucket.count += 1;
  return bucket.count <= limit;
}

/** Clears the counter after a successful login. */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}

/** Best-effort client identifier for throttling. Never logged. */
export function clientKey(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Small constant delay so failed logins are not faster to brute force. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
