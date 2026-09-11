import webpush from "web-push";
import { connectDB } from "@/lib/db";
import { PushSub } from "@/models/PushSub";

let configured = false;

function getVapidKeys() {
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  return { pub, priv };
}

function ensureConfig() {
  if (configured) return;
  const { pub, priv } = getVapidKeys();
  const sub = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!pub || !priv) throw new Error("VAPID keys not configured (need VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)");
  if (
    process.env.VAPID_PUBLIC_KEY &&
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PUBLIC_KEY !== process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  ) {
    console.error(
      "[push] VAPID_PUBLIC_KEY != NEXT_PUBLIC_VAPID_PUBLIC_KEY. Clients subscribed with a different key will never receive pushes. Make them identical."
    );
  }
  webpush.setVapidDetails(sub, pub, priv);
  configured = true;
}

export interface NotifyPayload {
  title: string;
  body: string;
  url?: string;
}

interface RawSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  mode?: string;
}

async function sendToSub(
  sub: RawSub,
  payload: NotifyPayload
): Promise<{ ok: boolean; status?: number; error?: string; dead?: boolean }> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    const message = err instanceof Error ? err.message : String(err);
    if (status === 404 || status === 410) {
      await PushSub.deleteOne({ endpoint: sub.endpoint });
      console.warn(`[push] removed dead subscription ${sub.endpoint.slice(0, 60)}… (${status})`);
      return { ok: false, status, error: message, dead: true };
    }
    console.error(`[push] send failed (${status ?? "no-status"}): ${message}`);
    return { ok: false, status, error: message };
  }
}

/**
 * Called after every sync. Sends one summary notification to every subscriber
 * when there are new solves: who solved how many in this sync tick plus each
 * solver's current TODAY (IST) points, with today's leader appended.
 *
 * All subscriptions are treated as per-sync (legacy per-problem / twice-daily
 * modes are normalized on read).
 *
 * Returns delivery counts so callers (sync route, logs) can observe failures
 * instead of silently swallowing them.
 */
export async function notifyAfterSync(synced: Record<string, number>) {
  ensureConfig();
  await connectDB();
  // One-time-style normalization: collapse legacy modes to per-sync.
  await PushSub.updateMany({ mode: { $ne: "per-sync" } }, { $set: { mode: "per-sync" } }).catch(() => {});
  const subs = (await PushSub.find().lean()) as unknown as RawSub[];
  if (subs.length === 0) {
    console.warn("[push] notifyAfterSync: no subscriptions, skipping");
    return { sent: 0, failed: 0, subs: 0, cleaned: 0, errors: [] as string[] };
  }

  const jobs: Promise<{ ok: boolean; status?: number; error?: string; dead?: boolean }>[] = [];

  // --- new solves: single summary to everyone ---
  const hasNew = Object.values(synced).some((n) => n > 0);
  if (hasNew) {
    // Today's leaderboard (IST) — solvers' current today-points, not all-time.
    let todayPts = new Map<string, number>();
    let todayLeader = "";
    try {
      const { getDayScores } = await import("@/lib/scores");
      const { todayIST } = await import("@/lib/leetcode");
      const totals = await getDayScores(todayIST());
      todayPts = new Map(totals.map((t) => [t.username, t.total]));
      const leader = totals[0];
      if (leader) todayLeader = ` • Today's leader: ${leader.username} (${leader.total} pts)`;
    } catch {
      /* today points are best-effort; notification still goes out without them */
    }

    const summaryParts: string[] = [];
    for (const [user, count] of Object.entries(synced)) {
      if (count > 0) {
        const pts = todayPts.get(user);
        summaryParts.push(
          pts != null ? `${user} +${count} (today ${pts} pts)` : `${user} +${count}`
        );
      }
    }

    const payload: NotifyPayload = {
      title: "LC Board — New solves!",
      body: `${summaryParts.join(", ")}${todayLeader}`,
      url: "/",
    };
    for (const sub of subs) jobs.push(sendToSub(sub, payload));
  } else {
    console.warn(`[push] notifyAfterSync: no new solves in ${JSON.stringify(synced)}, skipping`);
  }

  if (jobs.length === 0) return { sent: 0, failed: 0, subs: subs.length, cleaned: 0, errors: [] as string[] };
  const results = await Promise.allSettled(jobs);
  let sent = 0;
  let cleaned = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) sent++;
    else if (r.status === "fulfilled") {
      if (r.value.dead) cleaned++;
      errors.push(`${r.value.status ?? "?"}: ${r.value.error ?? "send failed"}`);
    }
    else errors.push(String(r.reason));
  }
  const failed = results.length - sent;
  if (failed > 0) console.error(`[push] notifyAfterSync: ${sent} sent, ${failed} failed, ${cleaned} dead removed: ${errors.join("; ")}`);
  return { sent, failed, subs: subs.length, cleaned, errors };
}

/** Send a test notification to one endpoint (self-test) or all subs. */
export async function sendTestPush(endpoint?: string) {
  ensureConfig();
  await connectDB();
  const query = endpoint ? { endpoint } : {};
  const subs = (await PushSub.find(query).lean()) as unknown as RawSub[];
  if (subs.length === 0) throw new Error(endpoint ? "subscription not found — resubscribe first" : "no subscriptions yet");
  const payload: NotifyPayload = {
    title: "LC Board — Test notification",
    body: "If you see this, push works. New-solve alerts will arrive automatically.",
    url: "/",
  };
  const results = await Promise.allSettled(subs.map((s) => sendToSub(s, payload)));
  let sent = 0;
  let cleaned = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) sent++;
    else if (r.status === "fulfilled") {
      if (r.value.dead) cleaned++;
      errors.push(`${r.value.status ?? "?"}: ${r.value.error ?? "send failed"}`);
    } else errors.push(String(r.reason));
  }
  return { sent, failed: results.length - sent, subs: subs.length, cleaned, errors };
}

/** Delete every stored push subscription (admin). Use when VAPID keys were
 * rotated or subs are stale — clients will resubscribe on next visit. */
export async function clearAllSubs() {
  await connectDB();
  const res = await PushSub.deleteMany({});
  return { deleted: res.deletedCount ?? 0 };
}

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? "";
}