import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
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
      await sleep(300); // be polite to LeetCode (~3 req/s max)
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

function isAuthorized(req: Request, cookieVal: string | undefined): boolean {
  if (verifySession(cookieVal)) return true;
  const secret = process.env.CRON_SECRET ?? "";
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  // Vercel Cron sends no auth by default; allow GET only when CRON_SECRET is unset (dev)
  return false;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  if (!isAuthorized(req, cookieStore.get(ADMIN_COOKIE)?.value))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await doSync());
}

// GET /api/sync — for Vercel Cron (sends Authorization header via vercel.json? no — use query secret fallback)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET ?? "";
  const cookieStore = await cookies();
  const ok =
    verifySession(cookieStore.get(ADMIN_COOKIE)?.value) ||
    (secret && (url.searchParams.get("secret") === secret ||
      req.headers.get("authorization") === `Bearer ${secret}`));
  if (!ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await doSync());
}
