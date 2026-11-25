import { NextResponse } from "next/server";
import { getPublicStats } from "@/lib/leetcode";

export const dynamic = "force-dynamic";

/** CDN cache window: numbers change slowly; also shields LeetCode from bursts. */
const S_MAXAGE = 3600;
const STALE_WHILE_REVALIDATE = 86400;
const CACHE_TTL_MS = S_MAXAGE * 1000;
const CACHE_CONTROL = `public, s-maxage=${S_MAXAGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`;

const USERNAME_RE = /^[a-zA-Z0-9-_]{1,30}$/;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonWithCors(
  body: unknown,
  init?: { status?: number; cache?: boolean; hit?: boolean; rateLimit?: { limit: number; remaining: number } }
) {
  const headers: Record<string, string> = {
    ...corsHeaders(),
    "Cache-Control": init?.cache ? CACHE_CONTROL : "no-store",
  };
  if (init?.hit !== undefined) headers["X-Cache"] = init.hit ? "HIT" : "MISS";
  if (init?.rateLimit) {
    headers["X-RateLimit-Limit"] = String(init.rateLimit.limit);
    headers["X-RateLimit-Remaining"] = String(init.rateLimit.remaining);
  }
  return NextResponse.json(body, { status: init?.status ?? 200, headers });
}

function errorWithCors(message: string, status: number) {
  // X-Cache is diagnostic only: errors never serve cached data, so always MISS.
  return NextResponse.json(
    { error: message },
    { status, headers: { ...corsHeaders(), "Cache-Control": "no-store", "X-Cache": "MISS" } }
  );
}

/** Optional abuse guard: set PUBLIC_STATS_ALLOWLIST="alice,bob" to restrict proxied usernames. */
function allowlist(): Set<string> | null {
  const raw = process.env.PUBLIC_STATS_ALLOWLIST?.trim();
  if (!raw) return null;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.size ? set : null;
}

interface CacheEntry {
  body: Record<string, unknown>;
  expiresAt: number;
}

/** Per-IP fixed-window rate limit (best-effort, per-instance like the cache;
 * spoofable/rotatable IPs mean this is a speed bump, not a hard wall — pair
 * with PUBLIC_STATS_ALLOWLIST for a hard restriction). */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_DEFAULT_MAX = 60;

function rateLimitMax(): number {
  const n = Number.parseInt(process.env.PUBLIC_STATS_RATE_LIMIT?.trim() ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : RATE_LIMIT_DEFAULT_MAX;
}

const rateHits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(ip: string, now: number): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const max = rateLimitMax();
  const entry = rateHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (rateHits.size > 1000) {
      for (const [k, v] of rateHits) if (v.resetAt <= now) rateHits.delete(k);
    }
    return { allowed: true, remaining: max - 1, retryAfterSec: 60 };
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  entry.count++;
  return { allowed: true, remaining: max - entry.count, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

/** Per-instance last-good cache: absorbs same-instance repeat hits inside the CDN
 * window (cross-instance hits rely on the CDN edge via s-maxage). Any upstream
 * error except authoritative 404 serves stale JSON; 404s evict instead. */
const cache = new Map<string, CacheEntry>();

export function __clearPublicStatsCacheForTests() {
  cache.clear();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  const now = Date.now();
  const max = rateLimitMax();
  const rl = checkRateLimit(clientIp(req), now);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — retry later" },
      {
        status: 429,
        headers: {
          ...corsHeaders(),
          "Cache-Control": "no-store",
          "X-Cache": "MISS",
          "Retry-After": String(rl.retryAfterSec),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }
  const rateLimit = { limit: max, remaining: rl.remaining };
  const raw = new URL(req.url).searchParams.get("username")?.trim() ?? "";
  if (!raw) return errorWithCors("Missing required query param: ?username=<leetcode-handle>", 400);
  if (!USERNAME_RE.test(raw))
    return errorWithCors("Invalid username: use 1-30 letters, numbers, - or _", 400);

  const allowed = allowlist();
  const key = raw.toLowerCase();
  if (allowed && !allowed.has(key)) return errorWithCors("Username not allowed", 403);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    // Echo the caller's casing; numbers/updatedAt stay cached.
    return jsonWithCors({ ...cached.body, username: raw }, { cache: true, hit: true, rateLimit });
  }

  try {
    const stats = await getPublicStats(raw);
    const body = {
      username: raw,
      solved: stats.solved,
      rating: stats.rating,
      globalRanking: stats.globalRanking,
      topPercentage: stats.topPercentage,
      updatedAt: new Date().toISOString(),
    };
    cache.set(key, { body, expiresAt: now + CACHE_TTL_MS });
    return jsonWithCors(body, { cache: true, hit: false, rateLimit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[public/stats] failed for ${raw}: ${msg}`);
    // Authoritative "user does not exist" beats any cached entry: evict so a
    // renamed/deleted handle flips to 404 instead of serving stale forever.
    if (msg.toLowerCase().includes("not found")) {
      cache.delete(key);
      return errorWithCors(`LeetCode user not found: ${raw}`, 404);
    }
    // Any other upstream error: serve last-good (even expired) so the
    // portfolio renders stale numbers, not an error.
    if (cached) {
      return jsonWithCors({ ...cached.body, username: raw, stale: true }, { cache: false, hit: true, rateLimit });
    }
    if (msg.includes("429") || msg.toLowerCase().includes("rate limited"))
      return errorWithCors("LeetCode rate limited (429) — retry later", 503);
    if (msg.includes("403") || msg.toLowerCase().includes("forbidden"))
      return errorWithCors("LeetCode blocked the upstream request (403) — retry later", 503);
    if (msg.toLowerCase().includes("network error"))
      return errorWithCors("LeetCode unreachable — retry later", 503);
    return errorWithCors("Failed to fetch LeetCode stats — retry later", 502);
  }
}
