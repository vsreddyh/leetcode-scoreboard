import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, safeEqual, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { getQuestionDetails, scoreFor, todayIST } from "@/lib/leetcode";
import { Submission } from "@/models/Submission";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doRefresh() {
  await connectDB();
  const today = todayIST();
  const docs = await Submission.find({ date: today }).lean();
  let updated = 0;
  for (const d of docs) {
    const doc = d as { username: string; titleSlug: string };
    try {
      const { acRate, difficulty } = await getQuestionDetails(doc.titleSlug);
      if (acRate == null) continue;
      await Submission.updateOne(
        { username: doc.username, titleSlug: doc.titleSlug },
        { $set: { acRate, difficulty, score: scoreFor(acRate) } }
      );
      updated++;
    } catch {
      // rate-limited or gone — leave stale value, retry tomorrow
    }
    await sleep(300);
  }
  return { ok: true, updated, total: docs.length, date: today };
}

async function authed(
  req: Request,
  cookieVal: string | undefined,
  url: URL
): Promise<boolean> {
  if (await verifySession(cookieVal)) return true;
  const secret = process.env.CRON_SECRET ?? "";
  return (
    (!!secret && safeEqual(url.searchParams.get("secret") ?? "", secret)) ||
    (!!secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`))
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await authed(req, c, url)))
    return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await doRefresh());
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await authed(req, c, url)))
    return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await doRefresh());
}