/*
  The browser-side cache for Open Library cover lookups, shared by the 2D
  timeline (CuriosityTimeline.astro) and the 3D corridor (scripts/corridor).
  Both key entries the same way — `${title}|${author}` — so whichever one a
  visitor sees first warms the cache for the other.

  v2: v1 cached a miss for 30 days, so every book the old compound-byline
  query failed on — six of them — would have kept its placeholder for a
  month after the fix shipped. Bumping the prefix retires those entries.
  Bump it again whenever a change should invalidate what visitors hold.

  Every localStorage call is wrapped: a blocked or full store can never throw
  past the caller.
*/

const CACHE_VERSION = "v2";
const CACHE_PREFIX = `ct-cover:${CACHE_VERSION}:`;
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Misses expire fast. A miss is usually "Open Library doesn't have it yet"
// or a query we can still improve, and neither should stick for a month.
const MISS_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export function coverCacheKey(title: string, author = ""): string {
  return `${title}|${author}`;
}

/**
 * A cached lookup that is still within its TTL, or undefined. A hit carries
 * the URL; a remembered miss carries "".
 */
export function readCoverCache(key: string): { url: string } | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ts !== "number" || typeof parsed?.url !== "string") {
      return undefined;
    }
    const ttl = parsed.url ? HIT_TTL_MS : MISS_TTL_MS;
    if (Date.now() - parsed.ts >= ttl) return undefined;
    return { url: parsed.url };
  } catch {
    return undefined;
  }
}

export function writeCoverCache(key: string, url: string): void {
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ url, ts: Date.now() })
    );
  } catch {
    // Storage unavailable or full — just skip caching this result.
  }
}

/** Drop entries left by an older cache version so they don't accumulate. */
export function evictOldCoverCaches(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("ct-cover:") && !key.startsWith(CACHE_PREFIX)) {
        stale.push(key);
      }
    }
    stale.forEach(key => localStorage.removeItem(key));
  } catch {
    // Not worth caring about; these are a few hundred bytes.
  }
}
