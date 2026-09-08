import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, safeEqual, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { todayIST } from "@/lib/leetcode";
import { refreshDayScores } from "@/lib/scores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function doRefresh() {
  await connectDB();
  const today = todayIST();
  const { updated, total } = await refreshDayScores(today);
  return { ok: true, updated, total, date: today };
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