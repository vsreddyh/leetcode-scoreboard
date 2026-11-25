# LeetCode Scoreboard

Next.js + MongoDB scoreboard. **Score per Accepted problem = 100 − acceptance rate** (harder = more points). **Daily score = sum per user per day (IST).**

## Architecture

- **Sync (write, every 5 min):** cron-job.org → `GET /api/sync` → LeetCode GraphQL (`recentSubmissionList` + `question.acRate`) → upsert into Mongo `submissions`. No UI involved. No Vercel crons.
- **Dashboard (read, public):** `/` → `GET /api/overall`, `GET /api/day/[date]`, `GET /api/history` → Mongo aggregation only. Never calls LeetCode.
- **Admin (protected):** `/admin` (password cookie) → manage tracked users, manual sync, view raw submissions.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | dashboard: totals + daily scores |
| `/admin` | password | user management + sync + latest 50 |
| `/admin/login` | public | password login |
| `GET /api/overall` | public | totals + active dates from Mongo |
| `GET /api/history` | public | per-user per-day totals for the progress chart |
| `GET /api/day/[date]` | public | per-day scores from Mongo |
| `GET /api/public/stats?username=<handle>` | public (CORS `*`) | live LeetCode solved count + contest rating proxy for the portfolio; cached 1h (`s-maxage=3600, stale-while-revalidate=86400`); per-IP rate limit (60/min, `PUBLIC_STATS_RATE_LIMIT`); `rating`/`globalRanking`/`topPercentage` are `number \\| null` (null when the user has no contest history); optional `PUBLIC_STATS_ALLOWLIST` |
| `GET/POST /api/sync` | admin cookie, `?secret=` or `Bearer CRON_SECRET` | sync all tracked users |
| `GET/POST/DELETE /api/admin/users` | admin cookie | tracked-user CRUD |

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`:

```
MONGODB_URI=mongodb://localhost:27017/leetcode-scoreboard
NEXT_PUBLIC_BASE_URL=http://localhost:3000
ADMIN_PASSWORD=change-me
ADMIN_SESSION_SECRET=some-long-random-string
CRON_SECRET=another-long-random-string
```

## Usage

1. Open `/admin/login`, log in with `ADMIN_PASSWORD`.
2. Add LeetCode usernames (stored lowercase in `trackedusers`, no seeds).
3. Click **Run sync**, or wait for cron-job.org (every 5 min).
4. View scores at `/`.

## Cron (all via cron-job.org — no Vercel crons)

- **Every 5 min (sync):** [cron-job.org](https://cron-job.org) → URL `https://<your-app>.vercel.app/api/sync?secret=<CRON_SECRET>`, every 5 minutes. This is the only scheduled job.
- **EOD refresh:** no separate cron — folded into the sync. The first sync tick at/after 23:30 IST re-fetches `acRate` for that day's (IST) questions and recomputes scores, guarded to run once per day (`SyncState` claim in Mongo).
- **Push notifications:** no separate cron. Each sync that finds new solves sends a
  per-sync summary (solver counts + today's IST points + leader); dead
  subscriptions (404/410) are deleted automatically.
- **Manual:** `/api/refresh?secret=<CRON_SECRET>` (or **Run sync** in `/admin`) still works on demand.
- Manual test:

```bash
curl "http://localhost:3000/api/sync?secret=$CRON_SECRET"
```

## Notes

- Only `Accepted` submissions score; WA/CE/etc. are ignored (not stored).
- Score stored **per question** (one doc per user+titleSlug, dated at first Accept); resubmits only bump a counter, never add points. Scores API also dedupes legacy per-submission docs.
- Score is **canonical per question**: one `titleSlug` = one `acRate`/score for everyone. A rate fetched for one solver is backfilled to all solvers of the same question, and each sync heals any divergent scores (e.g. 88.2 vs 88.4) with a single fresh fetch — so solving the same problem minutes apart always pays the same points.
- Dates are IST (`Asia/Kolkata`) `YYYY-MM-DD` buckets.
- EOD refresh: auto-runs inside the first sync at/after 23:30 IST (once per day), re-fetching `acRate` for **that day's (IST) questions** and recomputing scores.
- `recentSubmissionList` caps at 20/user/sync; history accumulates in Mongo over time.
- Polite throttling (~300ms between problem lookups, 1s between users); `429` surfaces as sync failure, retry next tick.
- Portfolio live counts: `GET /api/public/stats?username=<handle>` proxies LeetCode
  (`matchedUser.submitStatsGlobal` + `userContestRanking`) with `Access-Control-Allow-Origin: *`
  so the static site can fetch it directly. Caching is per-instance in-memory (1h TTL)
  plus CDN edge caching of successful GETs (`s-maxage=3600,
  stale-while-revalidate=86400`); a repeat hit on another serverless instance can
  still MISS upstream. Stale fallbacks and all errors are `no-store`, so misses
  after cache expiry hit origin every time (no edge shielding during a LeetCode
  outage). Failure mode: any upstream error except authoritative "user not found"
  error except authoritative "user not found" serves last-good stale JSON (`stale: true`)
  when a cache entry exists, otherwise a clean 503/502 error body; an authoritative
  "user not found" evicts the entry and returns 404 even when cached. Error bodies
  never include stack traces. `X-Cache: HIT/MISS` is diagnostic only.
  Rate limiting: per-IP fixed window, 60 req/min by default (`PUBLIC_STATS_RATE_LIMIT`
  overrides), `429 + Retry-After` when exceeded with `X-RateLimit-Limit/Remaining`
  on all GET responses (`OPTIONS` preflight sends CORS headers only). Per-instance
  and `X-Forwarded-For`-based, so rotatable IPs can dodge
  it — pair with `PUBLIC_STATS_ALLOWLIST` (unset or blank = allow all) for a hard restriction.
  Verify with `curl -i` (plain `curl` hides response headers):
  `curl -i '<deploy>/api/public/stats?username=<handle>'`. Optional `PUBLIC_STATS_ALLOWLIST`
  env (comma-separated handles) restricts proxied usernames; unset = any valid handle.
