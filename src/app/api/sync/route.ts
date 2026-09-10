import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, safeEqual, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { dayKey, getQuestionDetails, getRecentSubmissions, istMinutesNow, scoreFor, SEASON_START, todayIST } from "@/lib/leetcode";
import { notifyAfterSync } from "@/lib/push";
import { refreshDayScores } from "@/lib/scores";
import { getTrackedUsernames } from "@/lib/users";
import { Submission } from "@/models/Submission";
import { SyncState } from "@/models/SyncState";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 23:30 IST in minutes — EOD auto-refresh runs on the first sync at/after this. */
const EOD_MINUTES = 23 * 60 + 30;

/**
 * EOD refresh folded into the 5-min sync (no separate cron): on the first
 * sync at/after 23:30 IST, re-fetch acRate for today's docs once.
 * The atomic claim keeps overlapping ticks from double-running it.
 */
async function maybeEodRefresh(): Promise<{ updated: number; total: number } | null> {
  if (istMinutesNow() < EOD_MINUTES) return null;
  const today = todayIST();
  const claimed = await SyncState.updateOne(
    { key: "eodRefresh", value: { $ne: today } },
    { $set: { key: "eodRefresh", value: today } },
    { upsert: true }
  );
  if ((claimed.modifiedCount ?? 0) + (claimed.upsertedCount ?? 0) === 0) return null;
  return refreshDayScores(today);
}

async function doSync() {
  await connectDB();
  const cutoff = SEASON_START;
  // Drop any data before season start
  await Submission.deleteMany({ date: { $lt: cutoff } });
  const results: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const detail: Record<string, { fetched: number; accepted: number; skippedPreSeason: number; saved: number }> = {};
  // Canonical score per question: one titleSlug = one acRate/score for everyone.
  // acRate drifts over time, so without this two users solving the same problem
  // minutes apart get different points (each snapshots a different acRate).
  const freshRates = new Map<string, { acRate: number | null; difficulty: string | null }>();
  const usernames = await getTrackedUsernames();
  if (usernames.length === 0) {
    return { ok: true, synced: results, refreshed: null, notify: { sent: 0, failed: 0, subs: 0, cleaned: 0, errors: [] as string[] }, warnings: ["No tracked users — add LeetCode usernames in /admin first"] };
  }
  for (const username of usernames) {
    try {
      const recents = await getRecentSubmissions(username, 20);
      let saved = 0;
      let accepted = 0;
      let skippedPreSeason = 0;
      for (const s of recents) {
        if (s.statusDisplay !== "Accepted") continue;
        accepted++;
        const ts = Number(s.timestamp);
        if (!Number.isFinite(ts)) continue;
        const date = dayKey(ts);
        if (date < cutoff) {
          skippedPreSeason++; // skip pre-season
          continue;
        }
        const existing = await Submission.findOne({ username, titleSlug: s.titleSlug }).lean();
        const typed = existing as { acRate?: number | null; difficulty?: string | null } | null;
        // Reuse a rate fetched earlier in THIS run first (same question solved
        // by two users minutes apart must pay the same points), then the
        // stored value, then a fresh fetch as last resort.
        let acRate: number | null;
        let difficulty: string | null;
        const canonical = freshRates.get(s.titleSlug);
        if (canonical) {
          acRate = canonical.acRate;
          difficulty = canonical.difficulty;
        } else {
          acRate = typed?.acRate ?? null;
          difficulty = typed?.difficulty ?? null;
          if (acRate == null) {
            try {
              const qd = await getQuestionDetails(s.titleSlug);
              acRate = qd.acRate;
              difficulty = qd.difficulty;
              freshRates.set(s.titleSlug, { acRate, difficulty });
            } catch (err) {
              console.error(`[sync] question details failed for ${s.titleSlug}: ${err instanceof Error ? err.message : String(err)}`);
              // Keep going with score 0 rather than aborting the whole sync.
            }
            await sleep(300);
          }
        }
        const score = scoreFor(acRate);
        const baseUpdate = {
          $setOnInsert: {
            username,
            title: s.title,
            titleSlug: s.titleSlug,
            timestamp: ts,
            date,
            status: "Accepted",
            lang: s.lang,
            score,
          },
          $set: { difficulty, acRate },
          // $inc alone handles both cases: missing field counts as 0,
          // so upserts start at 1 and resubmits bump the counter.
          // (Cannot also list `submissions` under $setOnInsert —
          // Mongo rejects two operators on the same path.)
          $inc: { submissions: 1 },
        };
        await Submission.updateOne(
          { username, titleSlug: s.titleSlug },
          baseUpdate,
          { upsert: true }
        );
        // Only count first-time solves so repeat syncs don't re-notify
        if (!existing) saved++;
      }
      results[username] = saved;
      detail[username] = { fetched: recents.length, accepted, skippedPreSeason, saved };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sync] user ${username} failed: ${message}`);
      errors[username] = message;
      results[username] = 0;
    }
    await sleep(1000);
  }
  // Canonicalize: a rate fetched for one solver applies to ALL solvers of the
  // same question (heals the earlier-processed user too). Then heal any
  // pre-existing divergence (e.g. 88.2 vs 88.4) with one fresh fetch per slug.
  let healed = 0;
  for (const [slug, rate] of freshRates) {
    if (rate.acRate == null) continue;
    try {
      const r = await Submission.updateMany(
        { titleSlug: slug, date: { $gte: cutoff } },
        { $set: { acRate: rate.acRate, difficulty: rate.difficulty, score: scoreFor(rate.acRate) } }
      );
      healed += r.modifiedCount ?? 0;
    } catch (err) {
      console.error(`[sync] canonicalize ${slug} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    const divergent = (await Submission.aggregate([
      { $match: { date: { $gte: cutoff } } },
      { $group: { _id: "$titleSlug", scores: { $addToSet: "$score" } } },
      { $match: { "scores.1": { $exists: true } } },
    ])) as { _id: string }[];
    for (const d of divergent) {
      if (freshRates.has(d._id)) continue; // already canonicalized above
      try {
        const qd = await getQuestionDetails(d._id);
        if (qd.acRate == null) continue;
        const r = await Submission.updateMany(
          { titleSlug: d._id, date: { $gte: cutoff } },
          { $set: { acRate: qd.acRate, difficulty: qd.difficulty, score: scoreFor(qd.acRate) } }
        );
        healed += r.modifiedCount ?? 0;
      } catch (err) {
        console.error(`[sync] heal ${d._id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(300);
    }
  } catch (err) {
    console.error(`[sync] divergence check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Fire the single new-solve push notification (summary + leader).
  // Awaited so failures show up in the sync response / server logs
  // instead of vanishing silently.
  let notify: { sent: number; failed: number; subs: number; cleaned: number; errors: string[] };
  try {
    notify = await notifyAfterSync(results);
  } catch (err) {
    console.error(`[push] notifyAfterSync threw: ${err instanceof Error ? err.message : String(err)}`);
    notify = { sent: 0, failed: 0, subs: 0, cleaned: 0, errors: [err instanceof Error ? err.message : String(err)] };
  }
  // EOD acRate refresh, folded into sync so no second cron is needed
  const refreshed = await maybeEodRefresh().catch((err) => {
    console.error(`[sync] EOD refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  return { ok: true, synced: results, detail, errors, healed, refreshed, notify };
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function isAuthorized(
  req: Request,
  cookieVal: string | undefined,
  url?: URL
): Promise<boolean> {
  if (await verifySession(cookieVal)) return true;
  const secret = process.env.CRON_SECRET ?? "";
  return (
    (!!secret &&
      !!url &&
      safeEqual(url.searchParams.get("secret") ?? "", secret)) ||
    (!!secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`))
  );
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  if (!(await isAuthorized(req, cookieStore.get(ADMIN_COOKIE)?.value, new URL(req.url))))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await doSync());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync] fatal: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookieStore = await cookies();
  if (!(await isAuthorized(req, cookieStore.get(ADMIN_COOKIE)?.value, url)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await doSync());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync] fatal: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}