import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { getRecentSubmissions } from "@/lib/leetcode";
import { getTrackedUsernames } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Admin-only diagnostics for "login / sync not working" reports.
 * Returns env presence (never values), DB reachability, a LeetCode
 * probe for the first tracked user, and deployment hints.
 */
export async function GET() {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySession(c)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const env = {
    MONGODB_URI: !!process.env.MONGODB_URI,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: !!process.env.ADMIN_SESSION_SECRET,
    CRON_SECRET: !!process.env.CRON_SECRET,
    VAPID_PUBLIC_KEY: !!(process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
  };

  let db: { ok: boolean; error?: string } = { ok: false };
  try {
    await connectDB();
    db = { ok: true };
  } catch (err) {
    db = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let users: string[] = [];
  let usersError: string | undefined;
  if (db.ok) {
    try {
      users = await getTrackedUsernames();
    } catch (err) {
      usersError = err instanceof Error ? err.message : String(err);
    }
  }

  let leetcode: { ok: boolean; error?: string; count?: number } | null = null;
  if (users.length > 0) {
    try {
      const recents = await getRecentSubmissions(users[0], 5);
      leetcode = { ok: true, count: recents.length };
    } catch (err) {
      leetcode = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ok: true, env, db, users, usersError, leetcode });
}
