import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkCredentials, signSession } from "@/lib/admin";

export async function POST(req: Request) {
  if (!process.env.ADMIN_PASSWORD) {
    console.error("[admin] login attempted but ADMIN_PASSWORD is not set");
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: ADMIN_PASSWORD not set" },
      { status: 500 }
    );
  }
  const { password } = await req.json().catch(() => ({}));
  if (!(await checkCredentials(String(password ?? "")))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await signSession("admin"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
