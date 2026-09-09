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

type Mode = "per-sync" | "per-problem" | "twice-daily";

interface RawSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  mode?: Mode;
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

/** Current IST hour*60+minute. */
function istMinutesNow(): number {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** True if within ±5 min of 11:30 (690 min) or 23:30 (1410 min). */
function isDigestWindow(): boolean {
  const m = istMinutesNow();
  return Math.abs(m - 690) <= 5 || Math.abs(m - 1410) <= 5;
}

/**
 * Called after every sync. Sends:
 * - per-sync: one summary notification if any new solves
 * - per-problem: one notification per user with new solves
 * - twice-daily: digest only when within ±5 min of 11:30 AM/PM IST
 *
 * Returns delivery counts so callers (sync route, logs) can observe failures
 * instead of silently swallowing them.
 */
export async function notifyAfterSync(synced: Record<string, number>) {
  ensureConfig();
  await connectDB();
  const subs = (await PushSub.find().lean()) as unknown as RawSub[];
  if (subs.length === 0) {
    console.warn("[push] notifyAfterSync: no subscriptions, skipping");
    return { sent: 0, failed: 0, subs: 0, cleaned: 0, errors: [] as string[] };
  }

  const jobs: Promise<{ ok: boolean; status?: number; error?: string; dead?: boolean }>[] = [];

  // --- per-sync + per-problem: only when new solves ---
  const hasNew = Object.values(synced).some((n) => n > 0);
  if (hasNew) {
    const summaryParts: string[] = [];
    const detailParts: { user: string; count: number }[] = [];
    for (const [user, count] of Object.entries(synced)) {
      if (count > 0) {
        summaryParts.push(`${user}: ${count}`);
        detailParts.push({ user, count });
      }
    }

    const perSyncSubs = subs.filter((s) => (s.mode ?? "per-sync") === "per-sync");
    const perProblemSubs = subs.filter((s) => s.mode === "per-problem");

    if (perSyncSubs.length > 0) {
      const payload: NotifyPayload = {
        title: "LC Board — New solves!",
        body: summaryParts.join(", "),
        url: "/dashboard",
      };
      for (const sub of perSyncSubs) jobs.push(sendToSub(sub, payload));
    }

    if (perProblemSubs.length > 0) {
      for (const { user, count } of detailParts) {
        const payload: NotifyPayload = {
          title: `LC Board — ${user}`,
          body: `Solved ${count} new problem${count > 1 ? "s" : ""} today!`,
          url: "/dashboard",
        };
        for (const sub of perProblemSubs) jobs.push(sendToSub(sub, payload));
      }
    }
  } else {
    console.warn(`[push] notifyAfterSync: no new solves in ${JSON.stringify(synced)}, skipping per-sync/per-problem`);
  }

  // --- twice-daily: send digest only during 11:30 AM/PM IST window ---
  if (isDigestWindow()) {
    const digestSubs = subs.filter((s) => s.mode === "twice-daily");
    if (digestSubs.length > 0) {      const { getOverallScores } = await import("@/lib/scores");
      const totals = await getOverallScores();
      if (totals.length > 0) {
        const lines = totals.map(
          (t) => `${t.username}: ${t.total} pts (${t.count} problems)`
        );
        const payload: NotifyPayload = {
          title: "LC Board — Daily digest",
          body: lines.join(" | "),
          url: "/dashboard",
        };
        for (const sub of digestSubs) jobs.push(sendToSub(sub, payload));
      }
    }
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
    url: "/dashboard",
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