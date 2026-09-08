import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, safeEqual, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { dayKey, getQuestionDetails, getRecentSubmissions, scoreFor } from "@/lib/leetcode";
import { getTrackedUsernames } from "@/lib/users";
import { Submission } from "@/models/Submission";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doSync() {
  await connectDB();
  const results: Record<string, number> = {};
  for (const username of await getTrackedUsernames()) {
    const recents = await getRecentSubmissions(username, 20);
    let saved = 0;
    for (const s of recents) {
      if (s.statusDisplay !== "Accepted") continue;
      const ts = Number(s.timestamp);
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
            date: dayKey(ts),
            status: "Accepted",
            lang: s.lang,
            score,
          },
          $set: { difficulty, acRate },
          $inc: { submissions: existing ? 1 : 0 },
        },
        { upsert: true }
      );
      saved++;
    }
    results[username] = saved;
    await sleep(1000);
  }
  return { ok: true, synced: results };
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