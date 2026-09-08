import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, safeEqual, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import {
  dayKey,
  getAcRate,
  getRecentSubmissions,
  scoreFor,
} from "@/lib/leetcode";
import { getTrackedUsernames } from "@/lib/users";
import { Submission } from "@/models/Submission";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /api/sync — admin cookie OR cron (Authorization: Bearer CRON_SECRET, or GET for Vercel Cron)
async function doSync() {
  await connectDB();
  const results: Record<string, number> = {};
  for (const username of await getTrackedUsernames()) {
    const recents = await getRecentSubmissions(username, 20);
    let saved = 0;
    for (const s of recents) {
      if (s.statusDisplay !== "Accepted") continue; // score stored per question: only Accepted counts
      const ts = Number(s.timestamp);
      // One doc per user+question: keep earliest accept via $setOnInsert, bump counter
      const existing = await Submission.findOne({ username, titleSlug: s.titleSlug }).lean();
      const typed = existing as { acRate?: number | null } | null;
      const acRate = typed?.acRate ?? (await getAcRate(s.titleSlug));
      const score = scoreFor(acRate);
      if (typed == null) await sleep(300); // throttle only real LeetCode fetches
      await Submission.updateOne(
        { username, titleSlug: s.titleSlug },
        {
          $setOnInsert: {
            username,
            title: s.title,
            titleSlug: s.titleSlug,
            timestamp: ts,
            date: dayKey(ts),
            status: "Accepted",
            lang: s.lang,
            acRate,
            score,
          },
          $inc: { submissions: existing ? 1 : 0 },
        },
        { upsert: true }
      );
      saved++;
    }
    results[username] = saved;
    await sleep(1000); // 1s gap between users
  }
  return { ok: true, synced: results };
}
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: Request, cookieVal: string | undefined, url?: URL): Promise<boolean> {
  return verifySession(cookieVal).then((user) => {
    if (user) return true;
    const secret = process.env.CRON_SECRET ?? "";
    return (
      (!!secret && !!url && safeEqual(url.searchParams.get("secret") ?? "", secret)) ||
      (!!secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`))
    );
  });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  if (!(await isAuthorized(req, cookieStore.get(ADMIN_COOKIE)?.value, new URL(req.url))))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await doSync());
}

// GET /api/sync — cron-job.org / Vercel Cron with ?secret= (or Bearer)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookieStore = await cookies();
  if (!(await isAuthorized(req, cookieStore.get(ADMIN_COOKIE)?.value, url)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await doSync());
}
