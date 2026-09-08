import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { getAcRate, scoreFor } from "@/lib/leetcode";
import { Submission } from "@/models/Submission";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET/POST /api/refresh — re-fetch acRate for TODAY's (IST) questions only, recompute score.
// Runs EOD IST via Vercel Cron (18:00 UTC = 23:30 IST).
async function doRefresh() {
  await connectDB();
  const todayIST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const docs = await Submission.find({ date: todayIST }).lean();
  let updated = 0;
  for (const d of docs) {
    const doc = d as { username: string; titleSlug: string };
    try {
      const acRate = await getAcRate(doc.titleSlug);
      if (acRate == null) continue;
      await Submission.updateOne(
        { username: doc.username, titleSlug: doc.titleSlug },
        { $set: { acRate, score: scoreFor(acRate) } }
      );
      updated++;
    } catch {
      // rate-limited or gone — leave stale value, retry tomorrow
    }
    await sleep(300);
  }
  return { ok: true, updated, total: docs.length, date: todayIST };
}

async function authed(req: Request, cookieVal: string | undefined, url: URL): Promise<boolean> {
  if (await verifySession(cookieVal)) return true;
  const secret = process.env.CRON_SECRET ?? "";
  return !!secret && (url.searchParams.get("secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await authed(req, c, url))) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await doRefresh());
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await authed(req, c, url))) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await doRefresh());
}
