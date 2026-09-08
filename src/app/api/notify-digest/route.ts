import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, safeEqual, verifySession } from "@/lib/admin";
import { notifyDigest } from "@/lib/push";

export const dynamic = "force-dynamic";

async function isAuthed(
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
  if (!(await isAuthed(req, c, url)))
    return NextResponse.json({ ok: false }, { status: 401 });
  await notifyDigest();
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await isAuthed(req, c, url)))
    return NextResponse.json({ ok: false }, { status: 401 });
  await notifyDigest();
  return NextResponse.json({ ok: true });
}