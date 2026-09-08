import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { getTrackedUsernames } from "@/lib/users";
import { connectDB } from "@/lib/db";
import { TrackedUser } from "@/models/TrackedUser";

function authed(cookieVal: string | undefined) {
  return !!verifySession(cookieVal);
}

export async function GET() {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!authed(c)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ users: await getTrackedUsernames() });
}

export async function POST(req: Request) {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!authed(c)) return NextResponse.json({ ok: false }, { status: 401 });
  const { username } = await req.json().catch(() => ({}));
  const u = String(username ?? "").trim().toLowerCase();
  if (!u) return NextResponse.json({ ok: false, error: "username required" }, { status: 400 });
  await connectDB();
  await TrackedUser.updateOne({ username: u }, { $setOnInsert: { username: u } }, { upsert: true });
  return NextResponse.json({ ok: true, users: await getTrackedUsernames() });
}

export async function DELETE(req: Request) {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!authed(c)) return NextResponse.json({ ok: false }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const u = (searchParams.get("username") ?? "").trim().toLowerCase();
  if (!u) return NextResponse.json({ ok: false, error: "username required" }, { status: 400 });
  await connectDB();
  await TrackedUser.deleteOne({ username: u });
  return NextResponse.json({ ok: true, users: await getTrackedUsernames() });
}
