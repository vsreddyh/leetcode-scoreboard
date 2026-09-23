# LeetCode Scoreboard

Next.js + MongoDB scoreboard. **Score per Accepted problem = 100 − acceptance rate** (harder = more points). **Daily score = sum per user per day (IST).**

## Architecture

- **Sync (write, every 5 min):** cron-job.org → `GET /api/sync` → LeetCode GraphQL (`recentSubmissionList` + `question.acRate`) → upsert into Mongo `submissions`. No UI involved. No Vercel crons.
- **Dashboard (read, public):** `/dashboard` → `GET /api/scores` → Mongo aggregation only. Never calls LeetCode.
- **Admin (protected):** `/admin` (password cookie) → manage tracked users, manual sync, view raw submissions.

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | dashboard: totals + daily scores |
| `/admin` | password | user management + sync + latest 50 |
| `/admin/login` | public | password login |
| `GET /api/overall` | public | totals + active dates from Mongo |
| `GET /api/day/[date]` | public | per-day scores from Mongo |
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
