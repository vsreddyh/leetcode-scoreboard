import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { clearAllSubs, sendTestPush } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Self-test for push notifications.
 * - POST { endpoint }: sends a test push to that subscription only.
 *   No admin login needed (knowing the exact endpoint proves ownership).
 * - POST {} with admin cookie: broadcasts a test to all subscriptions.
 */
export async function POST(req: Request) {
  const { endpoint } = await req.json().catch(() => ({} as { endpoint?: string }));
  try {
    if (endpoint) {
      const result = await sendTestPush(endpoint);
      return NextResponse.json({ ok: true, ...result });
    }
    const c = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (!(await verifySession(c)))
      return NextResponse.json(
        { ok: false, error: "Unauthorized — pass your endpoint or log in as admin" },
        { status: 401 }
      );
    const result = await sendTestPush();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[push] test failed: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE (admin only): remove ALL stored push subscriptions.
 * Use after rotating VAPID keys or when subs are stale/broken —
 * dead subs are already auto-removed on 404/410 during sends,
 * but this wipes everything so clients resubscribe fresh.
 */
export async function DELETE() {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySession(c)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { deleted } = await clearAllSubs();
  console.warn(`[push] admin cleared all subscriptions (${deleted} removed)`);
  return NextResponse.json({ ok: true, deleted });
}
