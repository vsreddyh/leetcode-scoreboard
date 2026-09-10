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
  for (const username of await getTrackedUsernames()) {
    const recents = await getRecentSubmissions(username, 20);
    let saved = 0;
    for (const s of recents) {
      if (s.statusDisplay !== "Accepted") continue;
      const ts = Number(s.timestamp);
      const date = dayKey(ts);
      if (date < cutoff) continue; // skip pre-season
      const existing = await Submission.findOne({ username, titleSlug: s.titleSlug }).lean();
      const typed = existing as { acRate?: number | null; difficulty?: string | null } | null;
      let acRate = typed?.acRate ?? null;
      let difficulty = typed?.difficulty ?? null;
      if (acRate == null) {
        const qd = await getQuestionDetails(s.titleSlug);
        acRate = qd.acRate;
        difficulty = qd.difficulty;
        await sleep(300);
      }
      const score = scoreFor(acRate);
      await Submission.updateOne(
        { username, titleSlug: s.titleSlug },
        {
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
          $inc: { submissions: existing ? 1 : 0 },
        },
        { upsert: true }
      );
      // Only count first-time solves so repeat syncs don't re-notify
      if (!existing) saved++;
    }
    results[username] = saved;
    await sleep(1000);
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
  const refreshed = await maybeEodRefresh().catch(() => null);
  return { ok: true, synced: results, refreshed, notify };
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
  return NextResponse.json(await doSync());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookieStore = await cookies();
  if (!(await isAuthorized(req, cookieStore.get(ADMIN_COOKIE)?.value, url)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await doSync());
}